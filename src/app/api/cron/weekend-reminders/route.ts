import { NextRequest, NextResponse } from 'next/server';

import { sendWeekendReminderEmail } from '@/lib/email/otp';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { err, ok } from '@/types/api';

// Scheduled (pg_cron) endpoint. On the morning of a weekend request's date it
// emails the requester — registered or guest — a reminder to mint their
// collection code, linking to the page where they do it. No code is emailed
// for the weekend flow; the code is always minted on the day.
//
// Auth is a shared bearer secret (CRON_SECRET), not a user session: this runs
// without an actor. The service-role admin client is used because there is no
// session to satisfy RLS. The secret never reaches the browser.
//
// Idempotent: only requests with reminder_sent_at IS NULL are picked up, and the
// column is stamped after a successful send, so a cron retry never double-emails.

export const POST = async (request: NextRequest) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    const ref = crypto.randomUUID();
    logger.error('weekend-reminders: CRON_SECRET not configured', { ref });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });
  }

  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: due, error } = await admin
    .from('requests')
    .select('id, requester_id, guest_id, access_token')
    .eq('type', 'WEEKEND')
    .eq('status', 'APPROVED')
    .eq('requested_for', today)
    .is('reminder_sent_at', null);

  if (error) {
    const ref = crypto.randomUUID();
    logger.error('weekend-reminders: query failed', {
      err: error.message,
      ref,
    });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  if (!due || due.length === 0) {
    return NextResponse.json(ok({ sent: 0, failed: 0 }));
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://smartkey-ochre.vercel.app';

  const requesterIds = due
    .map((r) => r.requester_id)
    .filter((id): id is string => id !== null);
  const guestIds = due
    .map((r) => r.guest_id)
    .filter((id): id is string => id !== null);

  const [profilesRes, guestsRes] = await Promise.all([
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
  ]);

  const profileById = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
  const guestById = new Map((guestsRes.data ?? []).map((g) => [g.id, g]));

  const sentIds: string[] = [];
  let failed = 0;

  for (const req of due) {
    let to: string | null = null;
    let fullName = 'there';
    let link = `${siteUrl}/requester/dashboard`;

    if (req.requester_id) {
      const profile = profileById.get(req.requester_id);
      to = profile?.institutional_email ?? null;
      fullName = profile?.full_name ?? fullName;
    } else if (req.guest_id) {
      const guest = guestById.get(req.guest_id);
      to = guest?.email ?? null;
      fullName = guest?.full_name ?? fullName;
      link = `${siteUrl}/weekend-access/${req.access_token}`;
    }

    if (!to) {
      logger.error('weekend-reminders: no recipient for request', {
        request_id: req.id,
      });
      failed += 1;
      continue;
    }

    try {
      await sendWeekendReminderEmail({ to, link, fullName });
      sentIds.push(req.id);
    } catch (e) {
      logger.error('weekend-reminders: send failed', {
        request_id: req.id,
        err: e instanceof Error ? e.message : String(e),
      });
      failed += 1;
    }
  }

  if (sentIds.length > 0) {
    const { error: stampError } = await admin
      .from('requests')
      .update({ reminder_sent_at: new Date().toISOString() })
      .in('id', sentIds);

    if (stampError) {
      // The emails went out; failing to stamp risks a duplicate on the next run.
      // Log loudly but still report the sends as successful.
      logger.error('weekend-reminders: failed to stamp reminder_sent_at', {
        ids: sentIds,
        err: stampError.message,
      });
    }
  }

  return NextResponse.json(ok({ sent: sentIds.length, failed }));
};
