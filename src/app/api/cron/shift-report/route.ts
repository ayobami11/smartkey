import { fillShiftReport } from '@/lib/ai/reports/generate';
import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';

/** Placeholder marker written by `schedule_pending_shift_report()`. */
const PENDING = 'PENDING_GENERATION';

const MAX_PER_RUN = 5;

export const POST = route({
  name: 'shift-report',
  auth: 'cron',
  handler: async () => {
    const admin = createAdminClient();

    const { data: pending, error: pendingError } = await admin
      .from('shift_reports')
      .select('id, shift_id')
      .eq('markdown', PENDING)
      .order('generated_at', { ascending: true })
      .limit(MAX_PER_RUN);

    if (pendingError) {
      return respond.internal('shift-report: pending query failed', {
        err: pendingError.message,
      });
    }

    let generated = 0;
    let failed = 0;

    // Sequential, not Promise.all: each iteration is a Gemini call, and one
    // bad row must not abort the rest of the backlog.
    for (const row of pending ?? []) {
      try {
        await fillShiftReport(admin, {
          shiftId: row.shift_id,
          reportId: row.id,
        });
        generated += 1;
      } catch (error) {
        failed += 1;
        logger.error('shift-report: generation failed for report', {
          reportId: row.id,
          shiftId: row.shift_id,
          err: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info('shift-report: run complete', { generated, failed });

    return respond.ok({ generated, failed });
  },
});
