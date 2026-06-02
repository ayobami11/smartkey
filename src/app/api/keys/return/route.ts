import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

const bodySchema = z.object({
  request_id: z.string().uuid(),
  verifier_id: z.string().uuid(),
  returner_id: z.string().uuid().optional(),
});

const mapRpcError = (msg: string): { status: number; message: string } => {
  if (msg.includes('NOT_AUTHENTICATED')) return { status: 401, message: 'Not authenticated' };
  if (msg.includes('NOT_FOUND')) return { status: 404, message: 'Transaction not found' };
  if (msg.includes('NOT_ISSUED')) return { status: 409, message: 'Key has already been returned' };
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
  if (profile.role !== 'VERIFIER') return NextResponse.json(err('Forbidden', 403), { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(err('Invalid request body', 422), { status: 422 });
  }

  const { request_id, verifier_id, returner_id } = parsed.data;

  const { data: rpcData, error: rpcError } = await supabase.rpc('return_key', {
    p_request_id: request_id,
    p_verifier_id: verifier_id,
    p_returner_id: returner_id ?? null,
  });

  if (rpcError) {
    const mapped = mapRpcError(rpcError.message);
    if (mapped.status === 500) {
      const ref = crypto.randomUUID();
      logger.error('return_key RPC failed', { err: rpcError.message, ref });
      return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), { status: 500 });
    }
    return NextResponse.json(err(mapped.message, mapped.status), { status: mapped.status });
  }

  const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  if (!result) {
    const ref = crypto.randomUUID();
    logger.error('return_key RPC returned empty result', { ref });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), { status: 500 });
  }

  return NextResponse.json(
    ok({ request_id: result.request_id, returned_at: result.returned_at }),
    { status: 200 },
  );
};
