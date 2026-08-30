import { NextRequest, NextResponse } from 'next/server';

import { sendOverdueReminderEmail } from '@/lib/email/otp';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { err, ok } from '@/types/api';

export const POST = async (request: NextRequest) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    const ref = crypto.randomUUID();
    logger.error('overdue-reminders: CRON_SECRET not configured', { ref });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: due, error } = await admin
    .from('requests')
    .select(
      'id, requester_id, guest_id, return_deadline, key:keys(code, room_name)'
    )
    .eq('status', 'KEY_ISSUED')
    .lt('return_deadline', now)
    .is('overdue_reminder_sent_at', null);

  if (error) {
    const ref = crypto.randomUUID();
    logger.error('overdue-reminders: query failed', {
      err: error.message,
      ref,
    });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  if (!due || due.length === 0) {
    return NextResponse.json(ok({ sent: 0, suppressed: 0, failed: 0 }));
  }

  const requesterIds = due
    .map((r) => r.requester_id)
    .filter((id): id is string => id !== null);
  const guestIds = due
    .map((r) => r.guest_id)
    .filter((id): id is string => id !== null);

  const [profilesRes, guestsRes, prefsRes] = await Promise.all([
    requesterIds.length
      ? admin
          .from('profiles')
          .select('id, full_name, institutional_email')
          .in('id', requesterIds)
      : Promise.resolve({ data: [] as const }),
    guestIds.length
      ? admin
          .from('guest_requesters')
          .select('id, full_name, email')
          .in('id', guestIds)
      : Promise.resolve({ data: [] as const }),
    requesterIds.length
      ? admin
          .from('notification_preferences')
          .select('profile_id, overdue_email')
          .in('profile_id', requesterIds)
      : Promise.resolve({ data: [] as const }),
  ]);

  const profileById = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
  const guestById = new Map((guestsRes.data ?? []).map((g) => [g.id, g]));
  const prefByProfileId = new Map(
    (prefsRes.data ?? []).map((p) => [p.profile_id, p])
  );

  const processedIds: string[] = [];
  let sent = 0;
  let suppressed = 0;
  let failed = 0;

  for (const req of due) {
    const key = Array.isArray(req.key) ? req.key[0] : req.key;
    const keyCode = key?.code ?? '';
    const roomName = key?.room_name ?? '';

    let to: string | null = null;
    let fullName = 'there';
    // Absence of a preference row means the default (true) applies — it is
    // not an opt-out.
    let shouldSend = true;

    if (req.requester_id) {
      const profile = profileById.get(req.requester_id);
      to = profile?.institutional_email ?? null;
      fullName = profile?.full_name ?? fullName;
      const pref = prefByProfileId.get(req.requester_id);
      shouldSend = pref?.overdue_email ?? true;
    } else if (req.guest_id) {
      const guest = guestById.get(req.guest_id);
      to = guest?.email ?? null;
      fullName = guest?.full_name ?? fullName;
    }

    if (!to) {
      logger.error('overdue-reminders: no recipient for request', {
        request_id: req.id,
      });
      failed += 1;
      continue;
    }

    if (!shouldSend) {
      suppressed += 1;
      processedIds.push(req.id);
      continue;
    }

    try {
      await sendOverdueReminderEmail({
        to,
        fullName,
        keyCode,
        roomName,
        returnDeadline: req.return_deadline!,
      });
      sent += 1;
      processedIds.push(req.id);
    } catch (e) {
      logger.error('overdue-reminders: send failed', {
        request_id: req.id,
        err: e instanceof Error ? e.message : String(e),
      });
      failed += 1;
    }
  }

  if (processedIds.length > 0) {
    const { error: stampError } = await admin
      .from('requests')
      .update({ overdue_reminder_sent_at: new Date().toISOString() })
      .in('id', processedIds);

    if (stampError) {
      // Emails (for the non-suppressed rows) already went out; failing to
      // stamp risks a duplicate send on the next run.
      logger.error(
        'overdue-reminders: failed to stamp overdue_reminder_sent_at',
        {
          ids: processedIds,
          err: stampError.message,
        }
      );
    }
  }

  return NextResponse.json(ok({ sent, suppressed, failed }));
};
