import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

const bodySchema = z.object({
  request_id: z.uuid(),
});

const mapRpcError = (msg: string): { status: number; message: string } => {
  if (msg.includes('NOT_AUTHENTICATED'))
    return { status: 401, message: 'Not authenticated' };
  if (msg.includes('NOT_FOUND'))
    return { status: 404, message: 'Request not found' };
  if (msg.includes('FORBIDDEN'))
    return { status: 403, message: 'This is not your request' };
  if (msg.includes('NOT_EXPIRED'))
    return { status: 409, message: 'This code has not expired yet.' };
  return { status: 500, message: 'Internal error' };
};

export const POST = async (request: NextRequest) => {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(err('Invalid request body', 422), { status: 422 });
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'expire_request',
    {
      p_request_id: parsed.data.request_id,
      p_requester_id: user.id,
    }
  );

  if (rpcError) {
    const mapped = mapRpcError(rpcError.message);
    if (mapped.status === 500) {
      const ref = crypto.randomUUID();
      logger.error('expire_request RPC failed', {
        err: rpcError.message,
        ref,
      });
      return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
        status: 500,
      });
    }
    return NextResponse.json(err(mapped.message, mapped.status), {
      status: mapped.status,
    });
  }

  const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  return NextResponse.json(
    ok({
      request_id: result?.request_id ?? parsed.data.request_id,
      status: result?.status ?? 'EXPIRED',
    }),
    { status: 200 }
  );
};
