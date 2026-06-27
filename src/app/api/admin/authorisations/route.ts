import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

const bodySchema = z.object({
  key_id: z.string().uuid(),
  requester_id: z.string().uuid(),
});

const mapRpcError = (msg: string): { status: number; message: string } => {
  if (msg.includes('NOT_AUTHENTICATED'))
    return { status: 401, message: 'Unauthorized' };
  if (msg.includes('FORBIDDEN'))
    return { status: 403, message: 'Key not in your department' };
  if (msg.includes('CONFLICT: three'))
    return {
      status: 409,
      message: 'Three authorisation slots are already filled',
    };
  if (msg.includes('CONFLICT: requester'))
    return {
      status: 409,
      message: 'Requester is already authorised for this key',
    };
  if (msg.includes('REQUESTER_INACTIVE'))
    return {
      status: 422,
      message: 'This user account is deactivated and cannot be authorised',
    };
  return { status: 500, message: msg };
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
  if (!parsed.success)
    return NextResponse.json(err('Invalid request body', 422), { status: 422 });

  const { key_id, requester_id } = parsed.data;

  const { data, error } = await supabase.rpc('nominate_collector', {
    p_key_id: key_id,
    p_requester_id: requester_id,
  });

  if (error) {
    const mapped = mapRpcError(error.message);
    if (mapped.status === 500) {
      const ref = crypto.randomUUID();
      logger.error('nominate_collector rpc failed', {
        err: error.message,
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

  const slot_number = Array.isArray(data) ? data[0]?.slot_number : null;

  return NextResponse.json(
    ok({ authorisation_id: `${key_id}:${requester_id}`, slot_number }),
    { status: 201 }
  );
};
