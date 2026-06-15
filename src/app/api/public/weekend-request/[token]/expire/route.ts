import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { err, ok } from '@/types/api';

// Unauthenticated. Fired automatically by the status page when a collection
// code's countdown reaches 0. Flips a genuinely-expired CODE_ISSUED guest
// request to EXPIRED. Idempotent — returns the current status with no error if
// the request already moved on.

const mapRpcError = (msg: string): { status: number; message: string } => {
  if (msg.includes('NOT_FOUND'))
    return { status: 404, message: 'Request not found' };
  if (msg.includes('NOT_EXPIRED'))
    return { status: 409, message: 'The code has not expired yet.' };
  return { status: 500, message: 'Internal error' };
};

export const POST = async (
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) => {
  const { token } = await params;

  if (!z.uuid().safeParse(token).success) {
    return NextResponse.json(err('Request not found', 404), { status: 404 });
  }

  const adminClient = createAdminClient();

  const { data: rpcData, error: rpcError } = await adminClient.rpc(
    'expire_guest_request',
    { p_access_token: token }
  );

  if (rpcError) {
    const mapped = mapRpcError(rpcError.message);
    if (mapped.status === 500) {
      const ref = crypto.randomUUID();
      logger.error('expire_guest_request RPC failed', {
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
    logger.error('expire_guest_request returned empty result', { ref });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  return NextResponse.json(
    ok({ request_id: result.request_id, status: result.status }),
    { status: 200 }
  );
};
