import * as z from 'zod';

import {
  WEEKEND_DATE_MESSAGES,
  weekendDateProblem,
} from '@/lib/validation/weekend-date';
import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { rpcFail } from '@/lib/http/rpc-errors';
import { notifyAfterResponse } from '@/lib/notifications/notify';
import { callRpc } from '@/lib/rpc/call-rpc';
import { uploadExtension } from '@/lib/storage/extension';
import { createAdminClient } from '@/lib/supabase/admin';

// Unauthenticated. An external person (no SmartKey account) submits a weekend
// key request: declares an ID document, picks a department, and uploads the
// HOD authorisation letter. There is no session, so this route uses the
// service-role admin client to upload the letter and call the SECURITY DEFINER
// guest RPC. The service key never reaches the browser.
//
// Follow-up: add rate-limiting (per-IP / per-email) to this endpoint to prevent
// abuse, since it is unauthenticated and writes rows + uploads files.

const MAX_LETTER_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_LETTER_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'application/pdf',
];

// Validates the non-file fields. The letter File is validated separately.
const fieldsSchema = z.object({
  full_name: z.string().trim().min(1).max(200),
  email: z.email(),
  phone: z.string().trim().max(50).optional(),
  id_document_type: z.string().trim().min(1).max(100),
  id_document_number: z.string().trim().min(1).max(100),
  requested_room: z.string().trim().min(1).max(200),
  department_id: z.uuid(),
  weekend_date: z.iso.date(),
  return_deadline: z.iso.datetime({ offset: true }),
});

// Multipart, so no `body` schema: the handler reads the form itself.
export const POST = route({
  name: 'public/weekend-request',
  auth: 'public',
  handler: async ({ request }) => {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return respond.fail(422, 'Expected multipart/form-data');
    }

    const parsed = fieldsSchema.safeParse({
      full_name: formData.get('full_name'),
      email: formData.get('email'),
      phone: formData.get('phone') ?? undefined,
      id_document_type: formData.get('id_document_type'),
      id_document_number: formData.get('id_document_number'),
      requested_room: formData.get('requested_room'),
      department_id: formData.get('department_id'),
      weekend_date: formData.get('weekend_date'),
      return_deadline: formData.get('return_deadline'),
    });
    if (!parsed.success) return respond.fail(422, 'Invalid request body');
    const fields = parsed.data;

    const dateProblem = weekendDateProblem(fields.weekend_date);
    if (dateProblem) {
      return respond.fail(422, WEEKEND_DATE_MESSAGES[dateProblem]);
    }

    const letter = formData.get('letter');
    if (!(letter instanceof File) || letter.size === 0) {
      return respond.fail(422, 'An authorisation letter is required.');
    }
    if (letter.size > MAX_LETTER_BYTES) {
      return respond.fail(
        413,
        'The authorisation letter must be 5MB or smaller.'
      );
    }
    if (!ALLOWED_LETTER_TYPES.includes(letter.type)) {
      return respond.fail(
        422,
        'The authorisation letter must be an image or a PDF.'
      );
    }

    const admin = createAdminClient();

    // Upload the letter to the existing weekend-letters bucket. Guest letters
    // live under a guest/ prefix to keep them separate from registered
    // uploads.
    const ext = uploadExtension(letter.name, 'bin');
    const letterPath = `guest/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await admin.storage
      .from('weekend-letters')
      .upload(letterPath, await letter.arrayBuffer(), {
        contentType: letter.type,
        upsert: false,
      });
    if (uploadError) {
      return respond.internal('guest weekend-request: letter upload failed', {
        err: uploadError.message,
      });
    }

    const { data: letterUrlData } = admin.storage
      .from('weekend-letters')
      .getPublicUrl(letterPath);

    const result = await callRpc(admin, 'create_guest_weekend_request', {
      p_full_name: fields.full_name,
      p_email: fields.email,
      p_phone: fields.phone ?? '',
      p_id_type: fields.id_document_type,
      p_id_number: fields.id_document_number,
      p_department_id: fields.department_id,
      p_weekend_date: fields.weekend_date,
      p_return_deadline: fields.return_deadline,
      p_letter_url: letterUrlData.publicUrl,
      p_requested_room: fields.requested_room,
    });
    if (!result.ok) {
      return rpcFail(result.error, { NOT_FOUND: 'Department not found' });
    }

    // The guest's status link, and the authoriser's review email. Both run
    // after the response; a failed send never fails the request. The
    // one-click decision token was created with the request by the RPC.
    notifyAfterResponse({
      type: 'GUEST_SUBMISSION_RECEIVED',
      requestId: result.data.request_id,
    });
    notifyAfterResponse({
      type: 'WEEKEND_SUBMITTED',
      requestId: result.data.request_id,
    });

    return respond.ok(
      {
        access_token: result.data.access_token,
        request_id: result.data.request_id,
      },
      201
    );
  },
});
