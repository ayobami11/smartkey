import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { err, ok } from '@/types/api';

// Unauthenticated. Returns the safe, public-facing status of a guest weekend
// request, keyed on the unguessable access_token. Only the fields the status
// page needs are returned — no internal ids beyond the request id.

export const GET = async (
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) => {
  const { token } = await params;

  if (!z.uuid().safeParse(token).success) {
    return NextResponse.json(err('Request not found', 404), { status: 404 });
  }

  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from('requests')
    .select(
      `
      id,
      status,
      requested_for,
      return_deadline,
      code,
      code_expires_at,
      requested_room,
      keys ( code, room_name ),
      guest_requesters ( full_name )
    `
    )
    .eq('access_token', token)
    .maybeSingle();

  if (error) {
    const ref = crypto.randomUUID();
    logger.error('guest weekend-request status lookup failed', {
      ref,
      err: error.message,
    });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  if (!data) {
    return NextResponse.json(err('Request not found', 404), { status: 404 });
  }

  // The code is only meaningful while the request is awaiting collection.
  const isCodeIssued = data.status === 'CODE_ISSUED';

  return NextResponse.json(
    ok({
      request_id: data.id,
      status: data.status,
      requested_for: data.requested_for,
      return_deadline: data.return_deadline,
      requested_room: data.requested_room ?? null,
      full_name: data.guest_requesters?.full_name ?? null,
      key: data.keys
        ? { code: data.keys.code, room_name: data.keys.room_name }
        : null,
      code: isCodeIssued ? data.code : null,
      code_expires_at: isCodeIssued ? data.code_expires_at : null,
    }),
    { status: 200 }
  );
};
