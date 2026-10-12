import 'server-only';

import { formatDateLongTz } from '@/lib/dates';
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
import { createAdminClient } from '@/lib/supabase/admin';

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://smartkey-ochre.vercel.app';

// Emails the requester the outcome of a weekend decision. Runs after the RPC
// succeeds. Email failures are logged but never bubble up.
export const notifyWeekendDecided = async (
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
      ? formatDateLongTz(req.requested_for)
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
    logger.error('notify-weekend-decision: requester email failed', {
      requestId,
      decision,
      err: e instanceof Error ? e.message : String(e),
    });
  }
};

// Emails every opted-in ACTIVE CSO that a Dean's approval was held. Makes the
// "The CSO has been notified" copy on the held response true. Failures are
// logged, never surfaced — the hold itself already exists as the
// SIGNATURE_MISMATCH audit entry.
export const notifyCsoSignatureMismatch = async (
  requestId: string,
  mismatches: { signature?: number; stamp?: number },
  thresholdPct: number
) => {
  try {
    const admin = createAdminClient();
    const [recipients, reqInfo] = await Promise.all([
      getCsoRecipients(admin, 'signature_mismatch_email'),
      getRequestRecipient(admin, requestId),
    ]);
    if (recipients.length === 0 || !reqInfo) return;

    await Promise.all(
      recipients.map((recipient) =>
        sendCsoSignatureMismatchEmail({
          to: recipient.to,
          fullName: recipient.fullName,
          requesterName: reqInfo.fullName,
          keyCode: reqInfo.keyCode,
          roomName: reqInfo.roomName,
          mismatches,
          thresholdPct,
          link: `${siteUrl}/cso/dashboard`,
        })
      )
    );
  } catch (e) {
    logger.error(
      'notify-weekend-decision: cso signature-mismatch email failed',
      {
        requestId,
        err: e instanceof Error ? e.message : String(e),
      }
    );
  }
};
