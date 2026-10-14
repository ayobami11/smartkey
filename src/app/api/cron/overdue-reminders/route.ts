import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { logger } from '@/lib/logger';
import { notify } from '@/lib/notifications/notify';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = route({
  name: 'overdue-reminders',
  auth: 'cron',
  handler: async () => {
    const admin = createAdminClient();
    const now = new Date().toISOString();

    // Claim, then send (see cron/weekend-reminders). One UPDATE ... WHERE
    // overdue_reminder_sent_at IS NULL RETURNING id stamps the rows before any
    // email goes out, so an overlapping run cannot send the same reminder.
    //
    // The filter is the overdue rule — KEY_ISSUED with a passed
    // return_deadline — written as a PostgREST query. It must stay in step
    // with public.request_is_overdue() and isOverdue() in
    // src/lib/keys/occupancy.ts; the shared helpers are not used here only
    // because this is a server-side filter, not an in-memory check.
    const { data: claimed, error } = await admin
      .from('requests')
      .update({ overdue_reminder_sent_at: now })
      .eq('status', 'KEY_ISSUED')
      .lt('return_deadline', now)
      .is('overdue_reminder_sent_at', null)
      .select('id');

    if (error) {
      return respond.internal('overdue-reminders: claim failed', {
        err: error.message,
      });
    }

    const counts = { sent: 0, suppressed: 0, no_recipient: 0, failed: 0 };
    if (!claimed || claimed.length === 0) return respond.ok(counts);

    // Handled rows keep their stamp, so the hourly run never re-sends: sent,
    // turned off by the requester's overdue_email preference, or with nobody
    // to send to. Only a failed send is released, to be retried next hour.
    const failedIds: string[] = [];
    for (const req of claimed) {
      const outcome = await notify({
        type: 'OVERDUE_REMINDER',
        requestId: req.id,
      });
      counts[outcome] += 1;
      if (outcome === 'failed') failedIds.push(req.id);
    }

    if (failedIds.length > 0) {
      // Only our own claim: never clear a stamp some other writer set.
      const { error: releaseError } = await admin
        .from('requests')
        .update({ overdue_reminder_sent_at: null })
        .in('id', failedIds)
        .eq('overdue_reminder_sent_at', now);

      if (releaseError) {
        // The claim stands, so these reminders are not retried.
        logger.error('overdue-reminders: failed to release claim', {
          ids: failedIds,
          err: releaseError.message,
        });
      }
    }

    return respond.ok(counts);
  },
});
