import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  DEFAULT_THRESHOLD,
  verifySignature,
} from '@/lib/ai/signature/verifier';
import { writeAuditEntry } from '@/lib/audit';
import {
  sendGuestWeekendApprovedEmail,
  sendWeekendApprovedEmail,
  sendWeekendDeclinedEmail,
} from '@/lib/email/otp';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
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

const mapRpcError = (msg: string): { status: number; message: string } => {
  if (msg.includes('NOT_AUTHENTICATED'))
    return { status: 401, message: 'Not authenticated' };
  if (msg.includes('FORBIDDEN')) return { status: 403, message: 'Forbidden' };
  if (msg.includes('NOT_FOUND')) return { status: 404, message: 'Not found' };
  if (msg.includes('CONFLICT'))
    return { status: 409, message: msg.split(': ')[1] ?? 'Conflict' };
  if (msg.includes('NOT_AUTHORISED'))
    return { status: 403, message: 'Not authorised for this key' };
  if (msg.includes('EXPIRED_CODE'))
    return { status: 404, message: 'Code has expired' };
  return { status: 500, message: 'Internal error' };
};

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://smartkey-ochre.vercel.app';

// Fetch request + requester details and send the approval/decline email.
// Runs after the RPC succeeds. Email failures are logged but never bubble up.
const notifyRequester = async (
  requestId: string,
  decision: 'APPROVED' | 'DECLINED',
  note?: string
) => {
  try {
    const admin = createAdminClient();

    const { data: req } = await admin
      .from('requests')
      .select(
        'requester_id, guest_id, access_token, requested_for, key:keys(code, room_name), guest:guest_requesters(full_name, email), profile:profiles!requests_requester_id_fkey(full_name, institutional_email)'
      )
      .eq('id', requestId)
      .single();

    if (!req) return;

    const requestedFor = req.requested_for
      ? new Date(req.requested_for).toLocaleDateString('en-GB', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : '';

    const key = Array.isArray(req.key) ? req.key[0] : req.key;
    const keyCode = key?.code ?? '';
    const roomName = key?.room_name ?? '';

    if (req.guest_id && req.guest) {
      const guest = Array.isArray(req.guest) ? req.guest[0] : req.guest;
      if (!guest?.email) return;

      if (decision === 'APPROVED') {
        const link = `${siteUrl}/weekend-access/${req.access_token}`;
        await sendGuestWeekendApprovedEmail({
          to: guest.email,
          fullName: guest.full_name,
          link,
          requestedFor,
          keyCode,
          roomName,
        });
      }
      // Decline notification is not sent to guests — they can check the status page.
      return;
    }

    const profile = Array.isArray(req.profile) ? req.profile[0] : req.profile;
    if (!profile?.institutional_email) return;

    // Absence of a preference row means the default (true) applies — it is
    // not an opt-out. Guests (handled above) have no preference row and
    // always get this email regardless.
    if (req.requester_id) {
      const { data: pref } = await admin
        .from('notification_preferences')
        .select('weekend_decided_email')
        .eq('profile_id', req.requester_id)
        .maybeSingle();
      if (pref && !pref.weekend_decided_email) return;
    }

    if (decision === 'APPROVED') {
      const link = `${siteUrl}/requester/request/${requestId}/code`;
      await sendWeekendApprovedEmail({
        to: profile.institutional_email,
        fullName: profile.full_name,
        link,
        requestedFor,
        keyCode,
        roomName,
      });
    } else {
      await sendWeekendDeclinedEmail({
        to: profile.institutional_email,
        fullName: profile.full_name,
        note,
      });
    }
  } catch (e) {
    logger.error('hod-decision: notification email failed', {
      requestId,
      decision,
      err: e instanceof Error ? e.message : String(e),
    });
  }
};

export const POST = async (request: NextRequest) => {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, unit_id, signature_ref_url')
    .eq('id', user.id)
    .single();
  if (!profile)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });
  // HODs decide for their faculty's keys; the CSO decides for Administration
  // (authoriser = 'CSO') keys, which have no Dean. The RPC re-validates that the
  // actor's role matches the target department's authoriser, so a cross-type
  // attempt (HOD on an admin key, or CSO on a faculty key) is rejected there.
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
    key_id,
    cso_override,
  } = parsed.data;

  // Detect whether this is an external (guest) request. Guests have no HOD
  // reference signature to compare, so they take a distinct approval path that
  // assigns a key and skips signature verification (the HOD reviews the
  // uploaded letter manually).
  const { data: targetRequest } = await supabase
    .from('requests')
    .select('guest_id')
    .eq('id', request_id)
    .maybeSingle();
  const isGuestRequest = Boolean(targetRequest?.guest_id);

  if (decision === 'APPROVED' && isGuestRequest) {
    if (!key_id) {
      return NextResponse.json(
        err('A key must be assigned to approve an external request.', 422),
        { status: 422 }
      );
    }

    const { data, error } = await supabase.rpc('approve_guest_weekend', {
      p_request_id: request_id,
      p_hod_id: user.id,
      p_key_id: key_id,
      p_note: note ?? undefined,
    });

    if (error) {
      const mapped = mapRpcError(error.message);
      if (mapped.status === 500) {
        const ref = crypto.randomUUID();
        logger.error('approve_guest_weekend RPC failed', {
          err: error.message,
          ref,
        });
        return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
          status: 500,
        });
      }
      return NextResponse.json(err(mapped.message, mapped.status), {
        status: mapped.status,
      });
    }

    const result = Array.isArray(data) ? data[0] : data;
    void notifyRequester(result.request_id, 'APPROVED');
    return NextResponse.json(
      ok({ request_id: result.request_id, status: 'APPROVED' })
    );
  }

  if (decision === 'APPROVED') {
    // CSO approves Administration keys directly. There is no reference signature
    // for the CSO, so signature verification is skipped (the RPC gates the actor
    // against the key's authoriser).
    if (isCso) {
      const { data, error } = await supabase.rpc('approve_weekend', {
        p_request_id: request_id,
        p_hod_id: user.id,
        p_note: note ?? undefined,
        p_signature_verified: true,
        p_signature_mismatch_pct: undefined,
        p_cso_override: cso_override ?? false,
      });

      if (error) {
        const mapped = mapRpcError(error.message);
        if (mapped.status === 500) {
          const ref = crypto.randomUUID();
          logger.error('approve_weekend RPC failed', {
            err: error.message,
            ref,
          });
          return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
            status: 500,
          });
        }
        return NextResponse.json(err(mapped.message, mapped.status), {
          status: mapped.status,
        });
      }

      const result = Array.isArray(data) ? data[0] : data;
      void notifyRequester(result.request_id, 'APPROVED');
      return NextResponse.json(
        ok({ request_id: result.request_id, status: 'APPROVED' })
      );
    }

    if (!profile.signature_ref_url) {
      return NextResponse.json(
        err(
          'HOD onboarding is incomplete. Please upload your signature before approving requests.',
          403
        ),
        { status: 403 }
      );
    }

    // Run pixel-level signature verification when a submitted letter is present.
    if (submitted_signature_url) {
      let verifyResult: { mismatch_ratio: number; passed: boolean };

      try {
        const [refRes, subRes] = await Promise.all([
          fetch(profile.signature_ref_url),
          fetch(submitted_signature_url),
        ]);
        if (!refRes.ok || !subRes.ok)
          throw new Error('Failed to fetch signature images');

        const [refBuffer, subBuffer] = await Promise.all([
          refRes.arrayBuffer().then(Buffer.from),
          subRes.arrayBuffer().then(Buffer.from),
        ]);

        verifyResult = await verifySignature(refBuffer, subBuffer);
      } catch (e) {
        const ref = crypto.randomUUID();
        logger.error('hod-decision: signature fetch/verify failed', {
          ref,
          err: e instanceof Error ? e.message : String(e),
        });
        return NextResponse.json(
          err(`Signature verification error. Ref: ${ref}`, 500),
          { status: 500 }
        );
      }

      if (!verifyResult.passed) {
        // Approval is held — do not call approve_weekend. Write an audit entry
        // so the CSO can see the reference URL, submitted URL, and mismatch %.
        const mismatch_pct = parseFloat(
          (verifyResult.mismatch_ratio * 100).toFixed(2)
        );
        try {
          await writeAuditEntry({
            event: 'SIGNATURE_MISMATCH',
            actorId: user.id,
            actorRole: 'DEAN',
            targetType: 'request',
            targetId: request_id,
            payload: {
              ref_url: profile.signature_ref_url,
              submitted_url: submitted_signature_url,
              mismatch_pct,
              threshold_pct: parseFloat((DEFAULT_THRESHOLD * 100).toFixed(2)),
            },
          });
        } catch (auditErr) {
          logger.error(
            'hod-decision: failed to write signature_mismatch audit entry',
            {
              err:
                auditErr instanceof Error ? auditErr.message : String(auditErr),
            }
          );
        }

        return NextResponse.json(
          ok({
            request_id,
            status: 'HELD_SIGNATURE_MISMATCH',
            mismatch_pct,
            message:
              'Approval held: signature mismatch detected. The CSO has been notified.',
          })
        );
      }

      // Verification passed — call RPC with real mismatch data.
      const { data, error } = await supabase.rpc('approve_weekend', {
        p_request_id: request_id,
        p_hod_id: user.id,
        p_note: note ?? undefined,
        p_signature_verified: true,
        p_signature_mismatch_pct: parseFloat(
          (verifyResult.mismatch_ratio * 100).toFixed(2)
        ),
      });

      if (error) {
        const mapped = mapRpcError(error.message);
        if (mapped.status === 500) {
          const ref = crypto.randomUUID();
          logger.error('approve_weekend RPC failed', {
            err: error.message,
            ref,
          });
          return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
            status: 500,
          });
        }
        return NextResponse.json(err(mapped.message, mapped.status), {
          status: mapped.status,
        });
      }

      const result = Array.isArray(data) ? data[0] : data;
      void notifyRequester(result.request_id, 'APPROVED');
      return NextResponse.json(
        ok({ request_id: result.request_id, status: 'APPROVED' })
      );
    }

    // No submitted letter — proceed without comparison.
    const { data, error } = await supabase.rpc('approve_weekend', {
      p_request_id: request_id,
      p_hod_id: user.id,
      p_note: note ?? undefined,
      p_signature_verified: true,
      p_signature_mismatch_pct: undefined,
    });

    if (error) {
      const mapped = mapRpcError(error.message);
      if (mapped.status === 500) {
        const ref = crypto.randomUUID();
        logger.error('approve_weekend RPC failed', { err: error.message, ref });
        return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
          status: 500,
        });
      }
      return NextResponse.json(err(mapped.message, mapped.status), {
        status: mapped.status,
      });
    }

    const result = Array.isArray(data) ? data[0] : data;
    void notifyRequester(result.request_id, 'APPROVED');
    return NextResponse.json(
      ok({ request_id: result.request_id, status: 'APPROVED' })
    );
  } else {
    const { data, error } = await supabase.rpc('decline_weekend', {
      p_request_id: request_id,
      p_hod_id: user.id,
      p_note: note ?? undefined,
      p_cso_override: isCso ? (cso_override ?? false) : false,
    });

    if (error) {
      const mapped = mapRpcError(error.message);
      if (mapped.status === 500) {
        const ref = crypto.randomUUID();
        logger.error('decline_weekend RPC failed', { err: error.message, ref });
        return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
          status: 500,
        });
      }
      return NextResponse.json(err(mapped.message, mapped.status), {
        status: mapped.status,
      });
    }

    const result = Array.isArray(data) ? data[0] : data;
    void notifyRequester(result.request_id, 'DECLINED', note);
    return NextResponse.json(
      ok({ request_id: result.request_id, status: 'DECLINED' })
    );
  }
};
