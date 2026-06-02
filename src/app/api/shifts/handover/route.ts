import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

const bodySchema = z.object({
  outgoing_shift_id: z.string().uuid(),
  key_ids: z.array(z.string().uuid()),
  bulk: z.boolean(),
});

const mapRpcError = (msg: string): { status: number; message: string } => {
  if (msg.includes('NOT_AUTHENTICATED')) return { status: 401, message: 'Not authenticated' };
  if (msg.includes('CONFLICT')) return { status: 409, message: 'Handover already completed for this shift' };
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

  const { outgoing_shift_id, key_ids, bulk } = parsed.data;

  const { data: rpcData, error: rpcError } = await supabase.rpc('acknowledge_shift_handover', {
    p_outgoing_shift_id: outgoing_shift_id,
    p_key_ids: key_ids,
    p_bulk: bulk,
  });

  if (rpcError) {
    const mapped = mapRpcError(rpcError.message);
    if (mapped.status === 500) {
      const ref = crypto.randomUUID();
      logger.error('acknowledge_shift_handover RPC failed', { err: rpcError.message, ref });
      return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), { status: 500 });
    }
    return NextResponse.json(err(mapped.message, mapped.status), { status: mapped.status });
  }

  const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  if (!result) {
    const ref = crypto.randomUUID();
    logger.error('acknowledge_shift_handover returned empty result', { ref });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), { status: 500 });
  }

  return NextResponse.json(
    ok({ handover_id: result.handover_id, acknowledged_count: result.acknowledged_count }),
    { status: 200 },
  );
};
