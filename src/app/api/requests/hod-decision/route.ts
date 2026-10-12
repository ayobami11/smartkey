import { NextRequest, NextResponse } from 'next/server';
import * as z from 'zod';

import { decideWeekend, rejectionToHttp } from '@/lib/requests/decide-weekend';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

// The letter/stamp to verify and whether the CSO is overriding a held
// approval are derived server-side from the request row — the client does
// not send them. Unknown keys (from a stale bundle) are stripped by zod.
const bodySchema = z.object({
  request_id: z.uuid(),
  decision: z.enum(['APPROVED', 'DECLINED']),
  note: z.string().optional(),
  // For external (guest) requests the authoriser assigns the key on approval.
  key_id: z.uuid().optional(),
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
  if (profile.role !== 'DEAN' && profile.role !== 'CSO')
    return NextResponse.json(err('Forbidden', 403), { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(err('Invalid request body', 422), { status: 422 });
  }

  const { request_id, decision, note, key_id } = parsed.data;

  const result = await decideWeekend({
    requestId: request_id,
    actorId: user.id,
    decision,
    note,
    keyId: key_id,
  });

  if (result.outcome === 'REJECTED') {
    const { status, message } = rejectionToHttp(result.reason, result.ref);
    return NextResponse.json(err(message, status), { status });
  }

  if (result.outcome === 'HELD') {
    return NextResponse.json(
      ok({
        request_id: result.requestId,
        status: 'HELD_SIGNATURE_MISMATCH',
        mismatches: result.mismatches,
        message: 'Approval held: mismatch detected. The CSO has been notified.',
      })
    );
  }

  return NextResponse.json(
    ok({ request_id: result.requestId, status: result.outcome })
  );
};
