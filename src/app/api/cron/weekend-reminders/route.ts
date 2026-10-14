import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { logger } from '@/lib/logger';
import { notify } from '@/lib/notifications/notify';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = route({
  name: 'weekend-reminders',
  auth: 'cron',
  handler: async () => {
    const admin = createAdminClient();
    const today = new Date().toISOString().slice(0, 10);
    const claimedAt = new Date().toISOString();

    // Claim, then send. One UPDATE ... WHERE reminder_sent_at IS NULL
    // RETURNING id stamps the rows before any email goes out. Postgres locks
    // each row it updates and, under READ COMMITTED, re-checks the WHERE
    // clause once a concurrent writer commits, so an overlapping run gets
    // back only the rows it stamped itself: no reminder is sent twice.
    const { data: claimed, error } = await admin
      .from('requests')
      .update({ reminder_sent_at: claimedAt })
      .eq('type', 'WEEKEND')
      .eq('status', 'APPROVED')
      .eq('requested_for', today)
      .is('reminder_sent_at', null)
      .select('id');

    if (error) {
      return respond.internal('weekend-reminders: claim failed', {
        err: error.message,
      });
    }

    const counts = { sent: 0, suppressed: 0, no_recipient: 0, failed: 0 };
    if (!claimed || claimed.length === 0) return respond.ok(counts);

    // Handled rows keep their stamp: sent, turned off by preference, or with
    // nobody to send to. Only a failed send is released, so a later run the
    // same morning can retry it.
    const failedIds: string[] = [];
    for (const req of claimed) {
      const outcome = await notify({
        type: 'WEEKEND_REMINDER',
        requestId: req.id,
      });
      counts[outcome] += 1;
      if (outcome === 'failed') failedIds.push(req.id);
    }

    if (failedIds.length > 0) {
      // Only our own claim: never clear a stamp some other writer set.
      const { error: releaseError } = await admin
        .from('requests')
        .update({ reminder_sent_at: null })
        .in('id', failedIds)
        .eq('reminder_sent_at', claimedAt);

      if (releaseError) {
        // The claim stands, so these reminders are not retried.
        logger.error('weekend-reminders: failed to release claim', {
          ids: failedIds,
          err: releaseError.message,
        });
      }
    }

    return respond.ok(counts);
  },
});
