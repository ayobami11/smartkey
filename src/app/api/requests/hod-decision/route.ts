import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

const bodySchema = z.object({
  request_id: z.string().uuid(),
  decision: z.enum(['APPROVED', 'DECLINED']),
  note: z.string().optional(),
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
  if (profile.role !== 'HOD') return NextResponse.json(err('Forbidden', 403), { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(err('Invalid request body', 422), { status: 422 });
  }

  const { request_id, decision, note } = parsed.data;

  if (decision === 'APPROVED') {
    const { data, error } = await supabase.rpc('approve_weekend', {
      p_request_id: request_id,
      p_hod_id: user.id,
      p_note: note ?? null,
      p_signature_verified: true,
      p_signature_mismatch_pct: null,
    });

    if (error) {
      const mapped = mapRpcError(error.message);
      if (mapped.status === 500) {
        const ref = crypto.randomUUID();
        logger.error('approve_weekend RPC failed', { err: error.message, ref });
        return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), { status: 500 });
      }
      return NextResponse.json(err(mapped.message, mapped.status), { status: mapped.status });
    }

    const result = Array.isArray(data) ? data[0] : data;
    return NextResponse.json(ok({ request_id: result.request_id, status: 'CODE_ISSUED' }));
  } else {
    const { data, error } = await supabase.rpc('decline_weekend', {
      p_request_id: request_id,
      p_hod_id: user.id,
      p_note: note ?? null,
    });

    if (error) {
      const mapped = mapRpcError(error.message);
      if (mapped.status === 500) {
        const ref = crypto.randomUUID();
        logger.error('decline_weekend RPC failed', { err: error.message, ref });
        return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), { status: 500 });
      }
      return NextResponse.json(err(mapped.message, mapped.status), { status: mapped.status });
    }

    const result = Array.isArray(data) ? data[0] : data;
    return NextResponse.json(ok({ request_id: result.request_id, status: 'DECLINED' }));
  }
};
