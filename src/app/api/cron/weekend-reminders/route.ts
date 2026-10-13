import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { notify } from '@/lib/notifications/notify';
import { createAdminClient } from '@/lib/supabase/admin';
import { err, ok } from '@/types/api';


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
    .select('id')
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

  // Only a sent reminder is stamped; anything else retries on the next run
  // the same morning.
  const sentIds: string[] = [];
  let failed = 0;

  for (const req of due) {
    const outcome = await notify({
      type: 'WEEKEND_REMINDER',
      requestId: req.id,
    });
    if (outcome === 'sent') {
      sentIds.push(req.id);
    } else {
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
