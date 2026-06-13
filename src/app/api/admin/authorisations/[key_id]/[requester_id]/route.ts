import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

const mapRpcError = (msg: string): { status: number; message: string } => {
  if (msg.includes('NOT_AUTHENTICATED'))
    return { status: 401, message: 'Unauthorized' };
  if (msg.includes('FORBIDDEN'))
    return { status: 403, message: 'Key not in your department' };
  if (msg.includes('NOT_FOUND'))
    return { status: 404, message: 'Authorisation not found' };
  return { status: 500, message: msg };
};

export const DELETE = async (
  _request: NextRequest,
  { params }: { params: Promise<{ key_id: string; requester_id: string }> }
) => {
  const { key_id, requester_id } = await params;

  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });

  const { error } = await supabase.rpc('remove_collector', {
    p_key_id: key_id,
    p_requester_id: requester_id,
  });

  if (error) {
    const mapped = mapRpcError(error.message);
    if (mapped.status === 500) {
      const ref = crypto.randomUUID();
      logger.error('remove_collector rpc failed', { err: error.message, ref });
      return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
        status: 500,
      });
    }
    return NextResponse.json(err(mapped.message, mapped.status), {
      status: mapped.status,
    });
  }

  return NextResponse.json(ok(null), { status: 204 });
};
