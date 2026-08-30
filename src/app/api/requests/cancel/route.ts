import { NextRequest, NextResponse } from 'next/server';
import * as z from 'zod';

import { writeAuditEntry } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

const bodySchema = z.object({
  request_id: z.uuid(),
});

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

  const { request_id } = parsed.data;

  const { data: req } = await supabase
    .from('requests')
    .select('id, status, requester_id, key_id')
    .eq('id', request_id)
    .single();

  if (!req) return NextResponse.json(err('Not found', 404), { status: 404 });
  if (req.requester_id !== user.id)
    return NextResponse.json(err('Forbidden', 403), { status: 403 });
  // Cancellable in any pre-collection state the requester owns: a weekday code
  // (CODE_ISSUED), or a weekend request awaiting/holding HOD approval
  // (PENDING_HOD, APPROVED) — the latter would otherwise have no escape once its
  // date passes without a code being minted.
  const cancellableStatuses = ['CODE_ISSUED', 'PENDING_HOD', 'APPROVED'];
  if (!cancellableStatuses.includes(req.status)) {
    return NextResponse.json(
      err('Request cannot be cancelled in its current state', 409),
      { status: 409 }
    );
  }

  // RLS blocks direct UPDATE on requests for authenticated users — use the
  // service-role admin client to perform the status transition.
  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from('requests')
    .update({ status: 'CANCELLED' })
    .eq('id', request_id)
    .eq('requester_id', user.id);

  if (error) {
    const ref = crypto.randomUUID();
    logger.error('cancel request update failed', { err: error.message, ref });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  try {
    await writeAuditEntry({
      event: 'REQUEST_CANCELLED',
      actorId: user.id,
      actorRole: 'REQUESTER',
      targetType: 'request',
      targetId: request_id,
      payload: { key_id: req.key_id },
    });
  } catch (auditErr) {
    logger.error('cancel: audit write failed', {
      err: String(auditErr),
      request_id,
    });
  }

  return NextResponse.json(ok({ request_id, status: 'CANCELLED' }));
};
