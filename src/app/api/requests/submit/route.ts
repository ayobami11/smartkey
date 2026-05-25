
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

const bodySchema = z.object({
  key_id: z.string().uuid(),
  type: z.enum(['WEEKDAY', 'WEEKEND']),
  return_deadline: z.string().min(1),
  weekend_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const mapRpcError = (msg: string): { status: number; message: string } => {
  if (msg.includes('NOT_AUTHENTICATED')) return { status: 401, message: 'Not authenticated' };
  if (msg.includes('FORBIDDEN')) return { status: 403, message: 'Forbidden' };
  if (msg.includes('NOT_FOUND')) return { status: 404, message: 'Not found' };
  if (msg.includes('CONFLICT')) return { status: 409, message: msg.split(': ')[1] ?? 'Conflict' };
  if (msg.includes('NOT_AUTHORISED')) return { status: 403, message: 'Not authorised for this key' };
  if (msg.includes('EXPIRED_CODE')) return { status: 404, message: 'Code has expired' };
  return { status: 500, message: 'Internal error' };
};

export const POST = async (request: NextRequest) => {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json(err('Unauthorized', 401), { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, department_id')
    .eq('id', user.id)
    .single();
  if (!profile) return NextResponse.json(err('Unauthorized', 401), { status: 401 });
  if (profile.role !== 'REQUESTER') return NextResponse.json(err('Forbidden', 403), { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(err('Invalid request body', 422), { status: 422 });
  }

  const { key_id, type, return_deadline, weekend_date } = parsed.data;

  const { data, error } = await supabase.rpc('create_request', {
    p_key_id: key_id,
    p_type: type,
    p_return_deadline: return_deadline,
    p_weekend_date: weekend_date ?? null,
  });

  if (error) {
    const mapped = mapRpcError(error.message);
    if (mapped.status === 500) {
      const ref = crypto.randomUUID();
      logger.error('create_request RPC failed', { err: error.message, ref });
      return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), { status: 500 });
    }
    return NextResponse.json(err(mapped.message, mapped.status), { status: mapped.status });
  }

  const result = Array.isArray(data) ? data[0] : data;

  if (!result) {
    const ref = crypto.randomUUID();
    logger.error('create_request RPC returned empty result', { ref });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), { status: 500 });
  }

  if (type === 'WEEKEND') {
    return NextResponse.json(
      ok({
        request_id: result.request_id,
        status: 'PENDING_HOD',
        risk_tier: 'LOW',
      }),
      { status: 201 },
    );
  }

  return NextResponse.json(
    ok({
      request_id: result.request_id,
      code: result.code,
      code_expires_at: result.code_expires_at,
      risk_tier: 'LOW',
    }),
    { status: 201 },
  );
};
