import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { decideWeekendRequest } from '@/lib/requests/decide-weekend';
import { createAdminClient } from '@/lib/supabase/admin';
import { err, ok } from '@/types/api';


const SIGNED_URL_TTL_SECONDS = 300;

const signLetterUrl = async (
  admin: ReturnType<typeof createAdminClient>,
  fileUrl: string | null
): Promise<string | null> => {
  if (!fileUrl) return null;
  const bucketMarker = '/weekend-letters/';
  const markerIdx = fileUrl.indexOf(bucketMarker);
  if (markerIdx === -1) return null;
  const storagePath = fileUrl.slice(markerIdx + bucketMarker.length);
  const { data: signed } = await admin.storage
    .from('weekend-letters')
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  return signed?.signedUrl ?? null;
};

const findRequestByToken = async (
  admin: ReturnType<typeof createAdminClient>,
  token: string
) =>
  admin
    .from('requests')
    .select(
      `id, status, requested_for, key_id, letter_url, stamp_url,
       guest_id, requested_unit_id, requested_room,
       requester:profiles!requester_id(full_name),
       key:keys(code, room_name),
       guest:guest_requesters(full_name, id_document_type, id_document_number, phone)`
    )
    .eq('decision_token', token)
    .maybeSingle();

// Resolves the Dean-authorising unit for a request. Registered requests
// carry it indirectly via key_id -> keys.unit_id; guest requests have no
// key yet, so they carry it directly as requested_unit_id.
const resolveUnitId = async (
  admin: ReturnType<typeof createAdminClient>,
  reqRow: {
    guest_id: string | null;
    key_id: string | null;
    requested_unit_id: string | null;
  }
): Promise<string | null> => {
  if (reqRow.guest_id) return reqRow.requested_unit_id;
  if (!reqRow.key_id) return null;
  const { data: key } = await admin
    .from('keys')
    .select('unit_id')
    .eq('id', reqRow.key_id)
    .single();
  return key?.unit_id ?? null;
};

export const GET = async (
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) => {
  const { token } = await params;
  if (!z.uuid().safeParse(token).success) {
    return NextResponse.json(err('Request not found', 404), { status: 404 });
  }

  const admin = createAdminClient();
  const { data: reqRow, error } = await findRequestByToken(admin, token);

  if (error) {
    const ref = crypto.randomUUID();
    logger.error('dean-decision: lookup failed', { ref, err: error.message });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }
  if (!reqRow) {
    return NextResponse.json(err('Request not found', 404), { status: 404 });
  }

  const isGuest = !!reqRow.guest_id;
  const decidable = reqRow.status === 'PENDING_HOD';

  const [letterSignedUrl, stampSignedUrl, availableKeys] = await Promise.all([
    signLetterUrl(admin, reqRow.letter_url),
    signLetterUrl(admin, reqRow.stamp_url),
    (async () => {
      if (!isGuest || !decidable) return [];
      // Only reached for guest requests — resolveUnitId gives the
      // requested unit, from which the Dean must assign a key.
      const unitId = await resolveUnitId(admin, reqRow);
      if (!unitId) return [];
      const { data } = await admin
        .from('keys')
        .select('id, code, room_name')
        .eq('unit_id', unitId)
        .neq('status', 'RETIRED')
        .order('code', { ascending: true });
      return data ?? [];
    })(),
  ]);

  return NextResponse.json(
    ok({
      request_id: reqRow.id,
      status: reqRow.status,
      decidable,
      is_guest: isGuest,
      requested_for: reqRow.requested_for,
      requester_name: isGuest
        ? (reqRow.guest?.full_name ?? null)
        : (reqRow.requester?.full_name ?? null),
      requested_room: reqRow.requested_room,
      id_document_type: reqRow.guest?.id_document_type ?? null,
      id_document_number: reqRow.guest?.id_document_number ?? null,
      key: reqRow.key
        ? { code: reqRow.key.code, room_name: reqRow.key.room_name }
        : null,
      available_keys: availableKeys,
      letter_url: letterSignedUrl,
      stamp_url: stampSignedUrl,
    }),
    { status: 200 }
  );
};

const decisionBodySchema = z.object({
  decision: z.enum(['APPROVED', 'DECLINED']),
  note: z.string().optional(),
  // Required when approving a guest (external) request — the Dean assigns
  // the key at approval time. Ignored for registered requests and declines.
  key_id: z.uuid().optional(),
});

export const POST = async (
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) => {
  const { token } = await params;
  if (!z.uuid().safeParse(token).success) {
    return NextResponse.json(err('Request not found', 404), { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = decisionBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(err('Invalid request body', 422), {
      status: 422,
    });
  }

  const admin = createAdminClient();
  const { data: reqRow, error } = await findRequestByToken(admin, token);

  if (error) {
    const ref = crypto.randomUUID();
    logger.error('dean-decision: lookup failed', { ref, err: error.message });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }
  if (!reqRow) {
    return NextResponse.json(err('Request not found', 404), { status: 404 });
  }
  if (reqRow.status !== 'PENDING_HOD') {
    return NextResponse.json(
      err('This request has already been decided.', 409),
      { status: 409 }
    );
  }

  const isGuest = !!reqRow.guest_id;
  const unitId = await resolveUnitId(admin, reqRow);
  if (!unitId) {
    return NextResponse.json(err('Request not found', 404), { status: 404 });
  }

  // Re-resolve the *current* Dean of the unit at decision time, rather than
  // trusting an identity captured when the email was sent — handles a Dean
  // handover between submission and decision correctly.
  const { data: unit } = await admin
    .from('units')
    .select('authoriser, hod_id')
    .eq('id', unitId)
    .single();
  if (!unit || unit.authoriser !== 'DEAN' || !unit.hod_id) {
    return NextResponse.json(
      err('This request can no longer be decided by email.', 403),
      { status: 403 }
    );
  }

  const result = await decideWeekendRequest({
    requestId: reqRow.id,
    hodId: unit.hod_id,
    isCso: false,
    isGuest,
    decision: parsed.data.decision,
    note: parsed.data.note,
    keyId: parsed.data.key_id,
    // Guests have no HOD reference signature to compare against — the
    // authoriser reviews the uploaded letter manually, same as the
    // dashboard's guest-approval path.
    submittedSignatureUrl: isGuest ? undefined : (reqRow.letter_url ?? undefined),
    submittedStampUrl: isGuest ? undefined : (reqRow.stamp_url ?? undefined),
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
        message:
          'This approval has been held for review — the submitted signature or stamp did not match. The CSO has been notified.',
      })
    );
  }

  return NextResponse.json(
    ok({ request_id: result.requestId, status: result.status })
  );
};
