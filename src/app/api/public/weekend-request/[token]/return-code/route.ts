import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { err, ok } from '@/types/api';

const mapRpcError = (msg: string): { status: number; message: string } => {
  if (msg.includes('NOT_FOUND'))
    return { status: 404, message: 'Request not found.' };
  if (msg.includes('CONFLICT'))
    return { status: 409, message: 'Key is not currently issued.' };
  return { status: 500, message: 'Internal error.' };
};

export const POST = async (
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) => {
  const { token } = await params;

  if (!z.uuid().safeParse(token).success) {
    return NextResponse.json(err('Request not found.', 404), { status: 404 });
  }

  const { data: rpcData, error: rpcError } = await createAdminClient().rpc(
    'request_return_guest',
    { p_access_token: token }
  );

  if (rpcError) {
    const mapped = mapRpcError(rpcError.message);
    if (mapped.status === 500) {
      const ref = crypto.randomUUID();
      logger.error('request_return_guest RPC failed', {
        ref,
        err: rpcError.message,
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
  if (!result) {
    const ref = crypto.randomUUID();
    logger.error('request_return_guest RPC returned empty result', { ref });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  return NextResponse.json(
    ok({
      return_code: result.return_code,
      return_code_expires_at: result.return_code_expires_at,
    }),
    { status: 200 }
  );
};
