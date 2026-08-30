import { NextRequest, NextResponse } from 'next/server';
import * as z from 'zod';

import { decideWeekendRequest } from '@/lib/requests/decide-weekend';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

const bodySchema = z.object({
  request_id: z.uuid(),
  decision: z.enum(['APPROVED', 'DECLINED']),
  note: z.string().optional(),
  // URL of the HOD-signed letter uploaded by the requester to weekend-letters
  // storage. When present, the embedded signature is compared pixel-level
  // against the HOD's onboarded reference. Omit if no letter was uploaded.
  submitted_signature_url: z.url().optional(),
  // Same idea, for the departmental stamp. Independent of the signature
  // check — either, both, or neither may be present.
  submitted_stamp_url: z.url().optional(),
  // For external (guest) requests, the HOD assigns the actual key on approval —
  // the request has no key_id until then. Required when approving a guest
  // request; ignored for registered requests.
  key_id: z.uuid().optional(),
  // CSO-only. Resolves a faculty-key request that a Dean's approval attempt
  // held due to a signature mismatch. The RPC re-validates that a
  // SIGNATURE_MISMATCH audit entry actually exists for this request before
  // honouring the override.
  cso_override: z.boolean().optional(),
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
    .select('role, unit_id, signature_ref_url, stamp_ref_url')
    .eq('id', user.id)
    .single();
  if (!profile)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });
  if (profile.role !== 'DEAN' && profile.role !== 'CSO')
    return NextResponse.json(err('Forbidden', 403), { status: 403 });
  const isCso = profile.role === 'CSO';

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(err('Invalid request body', 422), { status: 422 });
  }

  const {
    request_id,
    decision,
    note,
    submitted_signature_url,
    submitted_stamp_url,
    key_id,
    cso_override,
  } = parsed.data;

  // Detect whether this is an external (guest) request. Guests have no HOD
  // reference signature to compare, so decideWeekendRequest takes a
  // distinct approval path for them that assigns a key and skips
  // signature verification (the HOD reviews the uploaded letter manually).
  const { data: targetRequest } = await supabase
    .from('requests')
    .select('guest_id')
    .eq('id', request_id)
    .maybeSingle();
  const isGuestRequest = Boolean(targetRequest?.guest_id);

  const result = await decideWeekendRequest({
    requestId: request_id,
    hodId: user.id,
    isCso,
    isGuest: isGuestRequest,
    decision,
    note,
    submittedSignatureUrl: submitted_signature_url,
    submittedStampUrl: submitted_stamp_url,
    csoOverride: cso_override,
    keyId: key_id,
  });

  if (!result.ok) {
    return NextResponse.json(err(result.message, result.httpStatus), {
      status: result.httpStatus,
    });
  }

  if (result.status === 'HELD_SIGNATURE_MISMATCH') {
    return NextResponse.json(
      ok({
        request_id: result.requestId,
        status: result.status,
        mismatches: result.mismatches,
        message: 'Approval held: mismatch detected. The CSO has been notified.',
      })
    );
  }

  return NextResponse.json(
    ok({ request_id: result.requestId, status: result.status })
  );
};
