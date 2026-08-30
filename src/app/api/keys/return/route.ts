import { NextRequest, NextResponse } from 'next/server';
import * as z from 'zod';

import { logger } from '@/lib/logger';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

const bodySchema = z
  .object({
    request_id: z.uuid(),
    returner_id: z.uuid().optional(),
    code: z
      .string()
      .regex(/^\d{6}$/, 'Code must be 6 digits')
      .optional(),
    override_reason: z.string().min(3).optional(),
  })
  .refine((data) => Boolean(data.code) || Boolean(data.override_reason), {
    message: 'A return code or an override reason is required',
  });

const mapRpcError = (msg: string): { status: number; message: string } => {
  if (msg.includes('NOT_AUTHENTICATED'))
    return { status: 401, message: 'Not authenticated' };
  if (msg.includes('NOT_FOUND'))
    return { status: 404, message: 'Transaction not found' };
  if (msg.includes('NOT_ISSUED'))
    return { status: 409, message: 'Key has already been returned' };
  if (msg.includes('BAD_RETURN_CODE'))
    return {
      status: 404,
      message: 'Return code not recognised. Ask the requester to check it.',
    };
  if (msg.includes('EXPIRED_RETURN_CODE'))
    return {
      status: 404,
      message:
        'Return code has expired. Ask the requester to generate a new one.',
    };
  if (msg.includes('NO_VERIFICATION'))
    return {
      status: 422,
      message: 'Enter the return code, or give a reason to return without one.',
    };
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
    .select('role, unit_id')
    .eq('id', user.id)
    .single();
  if (!profile)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });
  if (profile.role !== 'VERIFIER')
    return NextResponse.json(err('Forbidden', 403), { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(err('Invalid request body', 422), { status: 422 });
  }

  const { request_id, returner_id, code, override_reason } = parsed.data;

  // Use the server-verified user.id as the verifier, never a client payload.
  const { data: rpcData, error: rpcError } = await supabase.rpc('return_key', {
    p_request_id: request_id,
    p_verifier_id: user.id,
    p_code: code ?? undefined,
    p_returner_id: returner_id ?? undefined,
    p_override_reason: override_reason ?? undefined,
  });

  if (rpcError) {
    const mapped = mapRpcError(rpcError.message);
    if (mapped.status === 500) {
      const ref = crypto.randomUUID();
      logger.error('return_key RPC failed', { err: rpcError.message, ref });
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
    logger.error('return_key RPC returned empty result', { ref });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  return NextResponse.json(
    ok({
      request_id: result.request_id,
      returned_at: result.returned_at,
      verified: result.verified,
    }),
    { status: 200 }
  );
};
