import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { evaluateRisk } from '@/lib/ai/risk/engine';
import type { RiskContext } from '@/lib/ai/risk/types';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

const bodySchema = z.object({
  key_id: z.uuid(),
  type: z.enum(['WEEKDAY', 'WEEKEND']),
  return_deadline: z.string().min(1),
  weekend_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const mapRpcError = (msg: string): { status: number; message: string } => {
  if (msg.includes('NOT_AUTHENTICATED'))
    return { status: 401, message: 'Not authenticated' };
  if (msg.includes('FORBIDDEN')) return { status: 403, message: 'Forbidden' };
  if (msg.includes('NOT_FOUND')) return { status: 404, message: 'Not found' };
  if (msg.includes('CONFLICT'))
    return {
      status: 409,
      message:
        'Active request exists for this key. Cancel it or wait for the key to be returned.',
    };
  if (msg.includes('NOT_AUTHORISED'))
    return { status: 403, message: 'Not authorised for this key' };
  if (msg.includes('EXPIRED_CODE'))
    return { status: 404, message: 'Code has expired' };
  return { status: 500, message: 'Internal error' };
};

export const POST = async (request: NextRequest) => {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, department_id')
    .eq('id', user.id)
    .single();
  if (!profile)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });
  if (profile.role !== 'REQUESTER')
    return NextResponse.json(err('Forbidden', 403), { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(err('Invalid request body', 422), { status: 422 });
  }

  const { key_id, type, return_deadline, weekend_date } = parsed.data;

  // Fetch risk context data in parallel before calling the RPC.
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [keyRes, outstandingRes, recentRes, whitelistRes] = await Promise.all([
    supabase.from('keys').select('zone').eq('id', key_id).single(),
    supabase
      .from('requests')
      .select('id', { count: 'exact', head: true })
      .eq('requester_id', user.id)
      .in('status', ['CODE_ISSUED', 'KEY_ISSUED']),
    supabase
      .from('requests')
      .select('id', { count: 'exact', head: true })
      .eq('requester_id', user.id)
      .gte('created_at', since24h),
    supabase
      .from('authorisations')
      .select('profile_id', { count: 'exact', head: true })
      .eq('key_id', key_id)
      .eq('profile_id', user.id),
  ]);

  const riskCtx: RiskContext = {
    requestType: type,
    requestedAt: new Date(),
    keyZone: (keyRes.data?.zone as RiskContext['keyZone']) ?? 'NEW_SENATE',
    hasOutstandingKey: (outstandingRes.count ?? 0) > 0,
    recentRequestCount: recentRes.count ?? 0,
    isWhitelisted: (whitelistRes.count ?? 0) > 0,
  };
  const { tier, factors } = evaluateRisk(riskCtx);

  const { data, error } = await supabase.rpc('create_request', {
    p_key_id: key_id,
    p_type: type,
    p_return_deadline: return_deadline,
    p_weekend_date: weekend_date ?? undefined,
  });

  if (error) {
    const mapped = mapRpcError(error.message);
    if (mapped.status === 500) {
      const ref = crypto.randomUUID();
      logger.error('create_request RPC failed', { err: error.message, ref });
      return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
        status: 500,
      });
    }
    return NextResponse.json(err(mapped.message, mapped.status), {
      status: mapped.status,
    });
  }

  const result = Array.isArray(data) ? data[0] : data;

  if (!result) {
    const ref = crypto.randomUUID();
    logger.error('create_request RPC returned empty result', { ref });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  // Back-fill the real risk tier and factors. RLS blocks REQUESTER updates so
  // this goes via the admin client. The write is best-effort — a failure here
  // should not block the response; the default 'LOW' stored by the RPC is safe.
  const adminClient = createAdminClient();
  const { error: riskUpdateError } = await adminClient
    .from('requests')
    .update({ risk_tier: tier, risk_factors: factors as never })
    .eq('id', result.request_id);

  if (riskUpdateError) {
    logger.error('failed to persist risk tier', {
      requestId: result.request_id,
      tier,
      err: riskUpdateError.message,
    });
  }

  if (type === 'WEEKEND') {
    return NextResponse.json(
      ok({
        request_id: result.request_id,
        status: 'PENDING_HOD',
        risk_tier: tier,
      }),
      { status: 201 }
    );
  }

  return NextResponse.json(
    ok({
      request_id: result.request_id,
      code: result.code,
      code_expires_at: result.code_expires_at,
      risk_tier: tier,
    }),
    { status: 201 }
  );
};
