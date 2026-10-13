import * as z from 'zod';

import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { todayDateISOTz } from '@/lib/dates';
import { decideWeekend, rejectionToHttp } from '@/lib/requests/decide-weekend';
import { createAdminClient } from '@/lib/supabase/admin';

// The emailed one-click Dean decision. Unauthenticated: the unguessable
// decision_token is the authorisation, and every read and write goes through
// the service-role client created explicitly below.
//
// GET must never mutate. Mail scanners (Outlook Safe Links, Gmail) prefetch
// every link in an email, so a GET that decided anything would let the
// scanner approve or decline the request before a human opened it. Only the
// explicit button click (POST) decides.

type AdminClient = ReturnType<typeof createAdminClient>;

const SIGNED_URL_TTL_SECONDS = 300;

const paramsSchema = z.object({ token: z.uuid() });

// The link decides only while the request is pending and its weekend has not
// passed (approve_weekend refuses a past date anyway). Outside that window a
// forwarded or leaked email still opens the page, but shows only the outcome:
// no letter, no stamp, no ID details.
const isDecidable = (status: string, requestedFor: string): boolean =>
  status === 'PENDING_HOD' && requestedFor >= todayDateISOTz();

// This page needs no login, so the guest's ID number is shown only in part.
// The Dean sees it in full on the dashboard; the verifier checks the physical
// document at the desk.
const maskIdNumber = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const visible = value.slice(-4);
  return value.length > 4 ? `•••• ${visible}` : '••••';
};
const NOT_FOUND = { status: 404, message: 'Request not found' };

const signLetterUrl = async (
  admin: AdminClient,
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

const findRequestByToken = async (admin: AdminClient, token: string) =>
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
  admin: AdminClient,
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

export const GET = route({
  name: 'public/dean-decision',
  auth: 'public',
  params: paramsSchema,
  paramsError: NOT_FOUND,
  handler: async ({ params }) => {
    const admin = createAdminClient();
    const { data: reqRow, error } = await findRequestByToken(
      admin,
      params.token
    );

    if (error) {
      return respond.internal('dean-decision: lookup failed', {
        err: error.message,
      });
    }
    if (!reqRow) return respond.error(NOT_FOUND);

    const isGuest = !!reqRow.guest_id;
    const decidable = isDecidable(reqRow.status, reqRow.requested_for);

    const [letterSignedUrl, stampSignedUrl, availableKeys] = await Promise.all(
      [
        decidable ? signLetterUrl(admin, reqRow.letter_url) : null,
        decidable ? signLetterUrl(admin, reqRow.stamp_url) : null,
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
      ]
    );

    return respond.ok({
      request_id: reqRow.id,
      status: reqRow.status,
      decidable,
      is_guest: isGuest,
      requested_for: reqRow.requested_for,
      requester_name: isGuest
        ? (reqRow.guest?.full_name ?? null)
        : (reqRow.requester?.full_name ?? null),
      requested_room: reqRow.requested_room,
      id_document_type: decidable
        ? (reqRow.guest?.id_document_type ?? null)
        : null,
      id_document_number: decidable
        ? maskIdNumber(reqRow.guest?.id_document_number)
        : null,
      key: reqRow.key
        ? { code: reqRow.key.code, room_name: reqRow.key.room_name }
        : null,
      available_keys: availableKeys,
      letter_url: letterSignedUrl,
      stamp_url: stampSignedUrl,
    });
  },
});

const decisionBodySchema = z.object({
  decision: z.enum(['APPROVED', 'DECLINED']),
  note: z.string().optional(),
  // Required when approving a guest (external) request — the Dean assigns
  // the key at approval time. Ignored for registered requests and declines.
  key_id: z.uuid().optional(),
});

export const POST = route({
  name: 'public/dean-decision',
  auth: 'public',
  params: paramsSchema,
  paramsError: NOT_FOUND,
  body: decisionBodySchema,
  handler: async ({ params, body }) => {
    const admin = createAdminClient();
    const { data: reqRow, error } = await findRequestByToken(
      admin,
      params.token
    );

    if (error) {
      return respond.internal('dean-decision: lookup failed', {
        err: error.message,
      });
    }
    if (!reqRow) return respond.error(NOT_FOUND);
    if (reqRow.status !== 'PENDING_HOD') {
      return respond.fail(409, 'This request has already been decided.');
    }
    if (!isDecidable(reqRow.status, reqRow.requested_for)) {
      return respond.fail(
        409,
        'The requested date has passed, so this request can no longer be decided.'
      );
    }

    const unitId = await resolveUnitId(admin, reqRow);
    if (!unitId) return respond.error(NOT_FOUND);

    // Re-resolve the *current* Dean of the unit at decision time, rather than
    // trusting an identity captured when the email was sent — handles a Dean
    // handover between submission and decision correctly.
    const { data: unit } = await admin
      .from('units')
      .select('authoriser, hod_id')
      .eq('id', unitId)
      .single();
    if (!unit || unit.authoriser !== 'DEAN' || !unit.hod_id) {
      return respond.fail(
        403,
        'This request can no longer be decided by email.'
      );
    }

    // The letter/stamp to verify are read from the request row by
    // decideWeekend itself, so nothing is signed or passed here.
    const result = await decideWeekend({
      requestId: reqRow.id,
      actorId: unit.hod_id,
      decision: body.decision,
      note: body.note,
      keyId: body.key_id,
    });

    if (result.outcome === 'REJECTED') {
      return respond.error(rejectionToHttp(result.reason, result.ref));
    }

    if (result.outcome === 'HELD') {
      return respond.ok({
        request_id: result.requestId,
        status: 'HELD_SIGNATURE_MISMATCH',
        mismatches: result.mismatches,
        message:
          'This approval has been held for review — the submitted signature or stamp did not match. The CSO has been notified.',
      });
    }

    return respond.ok({ request_id: result.requestId, status: result.outcome });
  },
});
