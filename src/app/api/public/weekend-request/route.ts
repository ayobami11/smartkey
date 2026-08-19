import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { sendGuestWeekendEmail, sendWeekendSubmittedEmail } from '@/lib/email/otp';
import { getDeanRecipientForUnit } from '@/lib/email/request-recipient';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { err, ok } from '@/types/api';

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

const mapRpcError = (msg: string): { status: number; message: string } => {
  if (msg.includes('NOT_FOUND'))
    return { status: 404, message: 'Department not found' };
  return { status: 500, message: 'Internal error' };
};

// True for a future (or today) Saturday or Sunday in UTC terms.
const isWeekendDate = (isoDate: string): boolean => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  const day = date.getUTCDay();
  return day === 0 || day === 6;
};

export const POST = async (request: NextRequest) => {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(err('Expected multipart/form-data', 422), {
      status: 422,
    });
  }

  const fields = {
    full_name: formData.get('full_name'),
    email: formData.get('email'),
    phone: formData.get('phone') ?? undefined,
    id_document_type: formData.get('id_document_type'),
    id_document_number: formData.get('id_document_number'),
    requested_room: formData.get('requested_room'),
    department_id: formData.get('department_id'),
    weekend_date: formData.get('weekend_date'),
    return_deadline: formData.get('return_deadline'),
  };

  const parsed = fieldsSchema.safeParse(fields);
  if (!parsed.success) {
    return NextResponse.json(err('Invalid request body', 422), { status: 422 });
  }

  if (!isWeekendDate(parsed.data.weekend_date)) {
    return NextResponse.json(
      err('The selected date must be a Saturday or Sunday.', 422),
      { status: 422 }
    );
  }

  const letter = formData.get('letter');
  if (!(letter instanceof File) || letter.size === 0) {
    return NextResponse.json(err('An authorisation letter is required.', 422), {
      status: 422,
    });
  }

  if (letter.size > MAX_LETTER_BYTES) {
    return NextResponse.json(
      err('The authorisation letter must be 5MB or smaller.', 413),
      { status: 413 }
    );
  }

  if (!ALLOWED_LETTER_TYPES.includes(letter.type)) {
    return NextResponse.json(
      err('The authorisation letter must be an image or a PDF.', 422),
      { status: 422 }
    );
  }

  const adminClient = createAdminClient();

  // Upload the letter to the existing weekend-letters bucket. Guest letters
  // live under a guest/ prefix to keep them separate from registered uploads.
  const ext = letter.name.split('.').pop() ?? 'bin';
  const letterPath = `guest/${crypto.randomUUID()}.${ext}`;
  const letterBytes = await letter.arrayBuffer();

  const { error: uploadError } = await adminClient.storage
    .from('weekend-letters')
    .upload(letterPath, letterBytes, {
      contentType: letter.type,
      upsert: false,
    });

  if (uploadError) {
    const ref = crypto.randomUUID();
    logger.error('guest weekend-request: letter upload failed', {
      ref,
      err: uploadError.message,
    });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  const { data: letterUrlData } = adminClient.storage
    .from('weekend-letters')
    .getPublicUrl(letterPath);

  const { data: rpcData, error: rpcError } = await adminClient.rpc(
    'create_guest_weekend_request',
    {
      p_full_name: parsed.data.full_name,
      p_email: parsed.data.email,
      p_phone: parsed.data.phone ?? '',
      p_id_type: parsed.data.id_document_type,
      p_id_number: parsed.data.id_document_number,
      p_department_id: parsed.data.department_id,
      p_weekend_date: parsed.data.weekend_date,
      p_return_deadline: parsed.data.return_deadline,
      p_letter_url: letterUrlData.publicUrl,
      p_requested_room: parsed.data.requested_room,
    }
  );

  if (rpcError) {
    const mapped = mapRpcError(rpcError.message);
    if (mapped.status === 500) {
      const ref = crypto.randomUUID();
      logger.error('create_guest_weekend_request RPC failed', {
        ref,
        err: rpcError.message,
      });
      return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
        status: 500,
      });
    }
    return NextResponse.json(err(mapped.message, mapped.status), {
      status: mapped.status,
    });
  }

  const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  if (!result) {
    const ref = crypto.randomUUID();
    logger.error('create_guest_weekend_request returned empty result', { ref });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  // Send the status-link email. A failure here must not fail the request —
  // the request is already created; just log it.
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://smartkey-ochre.vercel.app';
  try {
    await sendGuestWeekendEmail({
      to: parsed.data.email,
      link: `${siteUrl}/weekend-access/${result.access_token}`,
      fullName: parsed.data.full_name,
    });
  } catch (e) {
    logger.error('guest weekend-request: status email failed', {
      err: e instanceof Error ? e.message : String(e),
    });
  }

  void getDeanRecipientForUnit(adminClient, parsed.data.department_id)
    .then(async (recipient) => {
      if (!recipient) return;

      // One-click email Approve/Decline — same mechanism as the registered
      // flow. Mint and persist the token before sending so the email link
      // is never dead on arrival.
      const decisionToken = crypto.randomUUID();
      const { error: tokenError } = await adminClient
        .from('requests')
        .update({ decision_token: decisionToken })
        .eq('id', result.request_id);
      if (tokenError) {
        logger.error('guest weekend-request: failed to persist decision_token', {
          requestId: result.request_id,
          err: tokenError.message,
        });
      }

      return sendWeekendSubmittedEmail({
        to: recipient.to,
        fullName: recipient.fullName,
        requesterName: parsed.data.full_name,
        unitName: recipient.unitName,
        requestedFor: parsed.data.weekend_date,
        link: `${siteUrl}/dean/weekend-requests`,
        isGuest: true,
        decisionLink: tokenError
          ? undefined
          : `${siteUrl}/dean-decision/${decisionToken}`,
      });
    })
    .catch((e: unknown) => {
      logger.error('guest weekend-request: dean notification failed', {
        requestId: result.request_id,
        err: e instanceof Error ? e.message : String(e),
      });
    });

  return NextResponse.json(
    ok(
      {
        access_token: result.access_token,
        request_id: result.request_id,
      },
      201
    ),
    { status: 201 }
  );
};
