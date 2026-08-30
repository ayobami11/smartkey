import { after } from 'next/server';

import {
  DEFAULT_THRESHOLD,
  verifySignature,
} from '@/lib/ai/signature/verifier';
import { writeAuditEntry } from '@/lib/audit';
import {
  sendCsoSignatureMismatchEmail,
  sendGuestWeekendApprovedEmail,
  sendWeekendApprovedEmail,
  sendWeekendDeclinedEmail,
} from '@/lib/email/otp';
import {
  getCsoRecipients,
  getRequestRecipient,
} from '@/lib/email/request-recipient';
import { logger } from '@/lib/logger';
import { downloadStorageObject } from '@/lib/storage/object-url';
import { createAdminClient } from '@/lib/supabase/admin';

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://smartkey-ochre.vercel.app';

export const mapRpcError = (
  msg: string
): { status: number; message: string } => {
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

// Fetch request + requester details and send the approval/decline email.
// Runs after the RPC succeeds. Email failures are logged but never bubble up.
export const notifyRequester = async (
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
    logger.error('decide-weekend: notification email failed', {
      requestId,
      decision,
      err: e instanceof Error ? e.message : String(e),
    });
  }
};

export type DecideWeekendParams = {
  requestId: string;
  hodId: string; // resolved Dean or CSO profile id
  isCso: boolean;
  // External (guest) request — approval assigns a key rather than
  // comparing a signature (guests have no HOD reference to compare
  // against). Ignored for DECLINE, which is identical for guest and
  // registered requests.
  isGuest: boolean;
  decision: 'APPROVED' | 'DECLINED';
  note?: string;
  submittedSignatureUrl?: string;
  submittedStampUrl?: string;
  csoOverride?: boolean;
  // Required when isGuest && decision === 'APPROVED'; ignored otherwise.
  keyId?: string;
};

export type DecideWeekendResult =
  | { ok: true; requestId: string; status: 'APPROVED' | 'DECLINED' }
  | {
      ok: true;
      requestId: string;
      status: 'HELD_SIGNATURE_MISMATCH';
      mismatches: { signature?: number; stamp?: number };
    }
  | { ok: false; httpStatus: number; message: string };

export const decideWeekendRequest = async (
  params: DecideWeekendParams
): Promise<DecideWeekendResult> => {
  const {
    requestId,
    hodId,
    isCso,
    isGuest,
    decision,
    note,
    submittedSignatureUrl,
    submittedStampUrl,
    csoOverride,
    keyId,
  } = params;

  const admin = createAdminClient();

  // External (guest) request approval — assigns a key rather than
  // comparing a signature (guests have no HOD reference on file; the
  // authoriser reviews the uploaded letter manually). Checked before the
  // CSO/Dean signature-verification branches below: a guest request may be
  // approved by either a Dean or the CSO, whichever authorises the chosen
  // key — approve_guest_weekend validates that itself.
  if (decision === 'APPROVED' && isGuest) {
    if (!keyId) {
      return {
        ok: false,
        httpStatus: 422,
        message: 'A key must be assigned to approve an external request.',
      };
    }

    const { data, error } = await admin.rpc('approve_guest_weekend', {
      p_request_id: requestId,
      p_hod_id: hodId,
      p_key_id: keyId,
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
        return {
          ok: false,
          httpStatus: 500,
          message: `Internal error. Ref: ${ref}`,
        };
      }
      return { ok: false, httpStatus: mapped.status, message: mapped.message };
    }

    const result = Array.isArray(data) ? data[0] : data;
    after(() => notifyRequester(result.request_id, 'APPROVED'));
    return { ok: true, requestId: result.request_id, status: 'APPROVED' };
  }

  if (decision === 'DECLINED') {
    const { data, error } = await admin.rpc('decline_weekend', {
      p_request_id: requestId,
      p_hod_id: hodId,
      p_note: note ?? undefined,
      p_cso_override: isCso ? (csoOverride ?? false) : false,
    });

    if (error) {
      const mapped = mapRpcError(error.message);
      if (mapped.status === 500) {
        const ref = crypto.randomUUID();
        logger.error('decline_weekend RPC failed', {
          err: error.message,
          ref,
        });
        return {
          ok: false,
          httpStatus: 500,
          message: `Internal error. Ref: ${ref}`,
        };
      }
      return { ok: false, httpStatus: mapped.status, message: mapped.message };
    }

    const result = Array.isArray(data) ? data[0] : data;
    after(() => notifyRequester(result.request_id, 'DECLINED', note));
    return { ok: true, requestId: result.request_id, status: 'DECLINED' };
  }

  // decision === 'APPROVED'

  // CSO approves Administration keys directly. There is no reference
  // signature for the CSO, so signature verification is skipped (the RPC
  // gates the actor against the key's authoriser).
  if (isCso) {
    const { data, error } = await admin.rpc('approve_weekend', {
      p_request_id: requestId,
      p_hod_id: hodId,
      p_note: note ?? undefined,
      p_signature_verified: true,
      p_signature_mismatch_pct: undefined,
      p_cso_override: csoOverride ?? false,
    });

    if (error) {
      const mapped = mapRpcError(error.message);
      if (mapped.status === 500) {
        const ref = crypto.randomUUID();
        logger.error('approve_weekend RPC failed', {
          err: error.message,
          ref,
        });
        return {
          ok: false,
          httpStatus: 500,
          message: `Internal error. Ref: ${ref}`,
        };
      }
      return { ok: false, httpStatus: mapped.status, message: mapped.message };
    }

    const result = Array.isArray(data) ? data[0] : data;
    after(() => notifyRequester(result.request_id, 'APPROVED'));
    return { ok: true, requestId: result.request_id, status: 'APPROVED' };
  }

  const { data: profileData } = await admin
    .from('profiles')
    .select('signature_ref_url, stamp_ref_url')
    .eq('id', hodId)
    .single();

  if (!profileData?.signature_ref_url) {
    return {
      ok: false,
      httpStatus: 403,
      message:
        'HOD onboarding is incomplete. Please upload your signature before approving requests.',
    };
  }

  // Run pixel-level verification for whichever of signature/stamp was
  // submitted — independent checks, either/both/neither may be present.
  if (submittedSignatureUrl || submittedStampUrl) {
    type CheckResult = {
      ref_url: string;
      submitted_url: string;
      mismatch_pct: number;
      passed: boolean;
    };

    const runCheck = async (
      refUrl: string,
      submittedUrl: string
    ): Promise<CheckResult> => {
      // Downloaded through the Storage API, not fetched over HTTP. The
      // reference lives in `hod-signatures` and the submitted image in
      // `weekend-letters` — both private buckets, so a plain fetch of the
      // stored URL returns an error body rather than image bytes.
      const [refBuffer, subBuffer] = await Promise.all([
        downloadStorageObject(admin, refUrl),
        downloadStorageObject(admin, submittedUrl),
      ]);

      const verifyResult = await verifySignature(refBuffer, subBuffer);
      return {
        ref_url: refUrl,
        submitted_url: submittedUrl,
        mismatch_pct: parseFloat(
          (verifyResult.mismatch_ratio * 100).toFixed(2)
        ),
        passed: verifyResult.passed,
      };
    };

    let signatureCheck: CheckResult | null = null;
    let stampCheck: CheckResult | null = null;

    try {
      if (submittedSignatureUrl) {
        signatureCheck = await runCheck(
          profileData.signature_ref_url,
          submittedSignatureUrl
        );
      }
      if (submittedStampUrl) {
        if (profileData.stamp_ref_url) {
          stampCheck = await runCheck(
            profileData.stamp_ref_url,
            submittedStampUrl
          );
        } else {
          logger.error(
            'decide-weekend: stamp submitted but no stamp_ref_url on file',
            { requestId }
          );
        }
      }
    } catch (e) {
      const ref = crypto.randomUUID();
      logger.error('decide-weekend: signature/stamp fetch/verify failed', {
        ref,
        err: e instanceof Error ? e.message : String(e),
      });
      return {
        ok: false,
        httpStatus: 500,
        message: `Signature verification error. Ref: ${ref}`,
      };
    }

    const failed = [signatureCheck, stampCheck].filter(
      (c): c is CheckResult => c !== null && !c.passed
    );

    if (failed.length > 0) {
      try {
        await writeAuditEntry({
          event: 'SIGNATURE_MISMATCH',
          actorId: hodId,
          actorRole: 'DEAN',
          targetType: 'request',
          targetId: requestId,
          payload: {
            signature: signatureCheck
              ? {
                  ref_url: signatureCheck.ref_url,
                  submitted_url: signatureCheck.submitted_url,
                  mismatch_pct: signatureCheck.mismatch_pct,
                }
              : null,
            stamp: stampCheck
              ? {
                  ref_url: stampCheck.ref_url,
                  submitted_url: stampCheck.submitted_url,
                  mismatch_pct: stampCheck.mismatch_pct,
                }
              : null,
            threshold_pct: parseFloat((DEFAULT_THRESHOLD * 100).toFixed(2)),
          },
        });
      } catch (auditErr) {
        logger.error(
          'decide-weekend: failed to write signature_mismatch audit entry',
          {
            err:
              auditErr instanceof Error ? auditErr.message : String(auditErr),
          }
        );
      }

      // Makes the "The CSO has been notified" claim above actually true.
      // Failures are logged, never surfaced; the hold itself already
      // succeeded via the audit entry above. Runs via after() rather than a
      // bare fire-and-forget promise — Vercel may freeze the function once
      // the response is sent, so an unawaited promise here can be silently
      // cut off mid-send.
      const mismatchThresholdPct = parseFloat(
        (DEFAULT_THRESHOLD * 100).toFixed(2)
      );
      after(() =>
        Promise.all([
          getCsoRecipients(admin, 'signature_mismatch_email'),
          getRequestRecipient(admin, requestId),
        ])
          .then(([recipients, reqInfo]) => {
            if (recipients.length === 0 || !reqInfo) return;
            return Promise.all(
              recipients.map((recipient) =>
                sendCsoSignatureMismatchEmail({
                  to: recipient.to,
                  fullName: recipient.fullName,
                  requesterName: reqInfo.fullName,
                  keyCode: reqInfo.keyCode,
                  roomName: reqInfo.roomName,
                  mismatches: {
                    ...(signatureCheck && !signatureCheck.passed
                      ? { signature: signatureCheck.mismatch_pct }
                      : {}),
                    ...(stampCheck && !stampCheck.passed
                      ? { stamp: stampCheck.mismatch_pct }
                      : {}),
                  },
                  thresholdPct: mismatchThresholdPct,
                  link: `${siteUrl}/cso/dashboard`,
                })
              )
            );
          })
          .catch((e: unknown) => {
            logger.error(
              'decide-weekend: cso signature-mismatch email failed',
              {
                requestId,
                err: e instanceof Error ? e.message : String(e),
              }
            );
          })
      );

      return {
        ok: true,
        requestId,
        status: 'HELD_SIGNATURE_MISMATCH',
        mismatches: {
          ...(signatureCheck && !signatureCheck.passed
            ? { signature: signatureCheck.mismatch_pct }
            : {}),
          ...(stampCheck && !stampCheck.passed
            ? { stamp: stampCheck.mismatch_pct }
            : {}),
        },
      };
    }

    const { data, error } = await admin.rpc('approve_weekend', {
      p_request_id: requestId,
      p_hod_id: hodId,
      p_note: note ?? undefined,
      p_signature_verified: true,
      p_signature_mismatch_pct: signatureCheck?.mismatch_pct,
    });

    if (error) {
      const mapped = mapRpcError(error.message);
      if (mapped.status === 500) {
        const ref = crypto.randomUUID();
        logger.error('approve_weekend RPC failed', {
          err: error.message,
          ref,
        });
        return {
          ok: false,
          httpStatus: 500,
          message: `Internal error. Ref: ${ref}`,
        };
      }
      return { ok: false, httpStatus: mapped.status, message: mapped.message };
    }

    const result = Array.isArray(data) ? data[0] : data;
    after(() => notifyRequester(result.request_id, 'APPROVED'));
    return { ok: true, requestId: result.request_id, status: 'APPROVED' };
  }

  // No submitted letter or stamp — proceed without comparison.
  const { data, error } = await admin.rpc('approve_weekend', {
    p_request_id: requestId,
    p_hod_id: hodId,
    p_note: note ?? undefined,
    p_signature_verified: true,
    p_signature_mismatch_pct: undefined,
  });

  if (error) {
    const mapped = mapRpcError(error.message);
    if (mapped.status === 500) {
      const ref = crypto.randomUUID();
      logger.error('approve_weekend RPC failed', { err: error.message, ref });
      return {
        ok: false,
        httpStatus: 500,
        message: `Internal error. Ref: ${ref}`,
      };
    }
    return { ok: false, httpStatus: mapped.status, message: mapped.message };
  }

  const result = Array.isArray(data) ? data[0] : data;
  after(() => notifyRequester(result.request_id, 'APPROVED'));
  return { ok: true, requestId: result.request_id, status: 'APPROVED' };
};
