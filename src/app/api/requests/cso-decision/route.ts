import { NextRequest, NextResponse } from 'next/server';
import * as z from 'zod';

import { writeAuditEntry } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

const bodySchema = z.object({
  request_id: z.uuid(),
  decision: z.enum(['APPROVED', 'DECLINED']),
  note: z.string().optional(),
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
    .select('role, unit_id')
    .eq('id', user.id)
    .single();
  if (!profile)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });
  if (profile.role !== 'CSO')
    return NextResponse.json(err('Forbidden', 403), { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(err('Invalid request body', 422), { status: 422 });
  }

  const { request_id, decision } = parsed.data;

  if (decision === 'DECLINED') {
    // RLS blocks direct UPDATE on requests for authenticated users — use the
    // service-role admin client to perform this status transition.
    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from('requests')
      .update({ status: 'CANCELLED' })
      .eq('id', request_id)
      .eq('status', 'CODE_ISSUED');

    if (error) {
      const ref = crypto.randomUUID();
      logger.error('cso-decision cancel failed', { err: error.message, ref });
      return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
        status: 500,
      });
    }
  }

  try {
    await writeAuditEntry({
      event:
        decision === 'DECLINED'
          ? 'REQUEST_DECLINED_CSO'
          : 'REQUEST_APPROVED_CSO',
      actorId: user.id,
      actorRole: 'CSO',
      targetType: 'request',
      targetId: request_id,
      payload: { decision },
    });
  } catch (auditErr) {
    logger.error('cso-decision: audit write failed', {
      err: String(auditErr),
      request_id,
    });
  }

  return NextResponse.json(
    ok({
      request_id,
      status: decision === 'DECLINED' ? 'CANCELLED' : 'CODE_ISSUED',
    })
  );
};
