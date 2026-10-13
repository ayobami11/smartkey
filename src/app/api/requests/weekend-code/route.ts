import { NextRequest, NextResponse } from 'next/server';
import * as z from 'zod';

import { logger } from '@/lib/logger';
import { notifyAfterResponse } from '@/lib/notifications/notify';
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
  if (msg.includes('TOO_EARLY'))
    return {
      status: 422,
      message: 'A collection code can only be generated on the requested date.',
    };
  // Minting the code is what reserves a key from the bunch, so this is the
  // point an approved weekend request can find the room already fully spoken
  // for. Distinct from CONFLICT, which is about the request's own state.
  if (msg.includes('NO_KEYS_AVAILABLE'))
    return {
      status: 409,
      message:
        'No key is available for this room right now. Every key is out or reserved — try again once one is returned.',
    };
  if (msg.includes('CONFLICT'))
    return { status: 409, message: 'This request is not awaiting collection.' };
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
    .select('role')
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

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'generate_weekend_code',
    {
      p_request_id: parsed.data.request_id,
      p_requester_id: user.id,
    }
  );

  if (rpcError) {
    const mapped = mapRpcError(rpcError.message);
    if (mapped.status === 500) {
      const ref = crypto.randomUUID();
      logger.error('generate_weekend_code RPC failed', {
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
  if (!result) {
    const ref = crypto.randomUUID();
    logger.error('generate_weekend_code RPC returned empty result', { ref });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  // A failed send never fails the request: the code is already shown in-app.
  notifyAfterResponse({ type: 'CODE_ISSUED', requestId: result.request_id });

  return NextResponse.json(
    ok({
      request_id: result.request_id,
      code: result.code,
      code_expires_at: result.code_expires_at,
    }),
    { status: 200 }
  );
};
