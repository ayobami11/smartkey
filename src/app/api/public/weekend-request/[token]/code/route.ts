import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { err, ok } from '@/types/api';

// Unauthenticated. On the requested weekend date only, mints a short-lived
// 6-digit collection code for an APPROVED guest request, keyed on the
// access_token. Calls the SECURITY DEFINER RPC via the service-role client.

const mapRpcError = (msg: string): { status: number; message: string } => {
  if (msg.includes('NOT_FOUND'))
    return { status: 404, message: 'Request not found' };
  if (msg.includes('TOO_EARLY'))
    return {
      status: 422,
      message: 'A collection code can only be generated on the requested date.',
    };
  if (msg.includes('CONFLICT'))
    return {
      status: 409,
      message: 'This request is not approved for collection.',
    };
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
    'generate_guest_weekend_code',
    { p_access_token: token }
  );

  if (rpcError) {
    const mapped = mapRpcError(rpcError.message);
    if (mapped.status === 500) {
      const ref = crypto.randomUUID();
      logger.error('generate_guest_weekend_code RPC failed', {
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
    logger.error('generate_guest_weekend_code returned empty result', { ref });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  return NextResponse.json(
    ok({
      request_id: result.request_id,
      code: result.code,
      code_expires_at: result.code_expires_at,
    }),
    { status: 200 }
  );
};
