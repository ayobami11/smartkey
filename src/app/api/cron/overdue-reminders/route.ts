import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { notify } from '@/lib/notifications/notify';
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

  // The filter below is the overdue rule — KEY_ISSUED with a passed
  // return_deadline — written as a PostgREST query. It must stay in step with
  // public.request_is_overdue() and isOverdue() in src/lib/keys/occupancy.ts;
  // the shared helpers are not used here only because this is a server-side
  // filter, not an in-memory check.
  const { data: due, error } = await admin
    .from('requests')
    .select('id')
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
    return NextResponse.json(
      ok({ sent: 0, suppressed: 0, no_recipient: 0, failed: 0 })
    );
  }

  // Stamped once handled, so the hourly run never re-sends: sent, turned off
  // by the requester's overdue_email preference, or with nobody to send to
  // (re-querying a requester with no address every hour helps no one).
  // Only a failed send is left unstamped, to be retried next hour.
  const processedIds: string[] = [];
  const counts = { sent: 0, suppressed: 0, no_recipient: 0, failed: 0 };

  for (const req of due) {
    const outcome = await notify({
      type: 'OVERDUE_REMINDER',
      requestId: req.id,
    });
    counts[outcome] += 1;
    if (outcome !== 'failed') processedIds.push(req.id);
  }

  if (processedIds.length > 0) {
    const { error: stampError } = await admin
      .from('requests')
      .update({ overdue_reminder_sent_at: new Date().toISOString() })
      .in('id', processedIds);

    if (stampError) {
      // The emails already went out; failing to stamp risks a duplicate
      // send on the next run.
      logger.error(
        'overdue-reminders: failed to stamp overdue_reminder_sent_at',
        {
          ids: processedIds,
          err: stampError.message,
        }
      );
    }
  }

  return NextResponse.json(ok(counts));
};
