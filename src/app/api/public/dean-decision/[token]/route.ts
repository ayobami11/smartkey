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
       requester:profiles!requester_id(full_name),
       key:keys(code, room_name)`
    )
    .eq('decision_token', token)
    .maybeSingle();

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

  const [letterSignedUrl, stampSignedUrl] = await Promise.all([
    signLetterUrl(admin, reqRow.letter_url),
    signLetterUrl(admin, reqRow.stamp_url),
  ]);

  return NextResponse.json(
    ok({
      request_id: reqRow.id,
      status: reqRow.status,
      decidable: reqRow.status === 'PENDING_HOD',
      requested_for: reqRow.requested_for,
      requester_name: reqRow.requester?.full_name ?? null,
      key: reqRow.key
        ? { code: reqRow.key.code, room_name: reqRow.key.room_name }
        : null,
      letter_url: letterSignedUrl,
      stamp_url: stampSignedUrl,
    }),
    { status: 200 }
  );
};

const decisionBodySchema = z.object({
  decision: z.enum(['APPROVED', 'DECLINED']),
  note: z.string().optional(),
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
  if (!reqRow.key_id) {
    return NextResponse.json(err('Request not found', 404), { status: 404 });
  }

  const { data: key } = await admin
    .from('keys')
    .select('unit_id')
    .eq('id', reqRow.key_id)
    .single();
  if (!key?.unit_id) {
    return NextResponse.json(err('Request not found', 404), { status: 404 });
  }

  const { data: unit } = await admin
    .from('units')
    .select('authoriser, hod_id')
    .eq('id', key.unit_id)
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
    decision: parsed.data.decision,
    note: parsed.data.note,
    submittedSignatureUrl: reqRow.letter_url ?? undefined,
    submittedStampUrl: reqRow.stamp_url ?? undefined,
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
