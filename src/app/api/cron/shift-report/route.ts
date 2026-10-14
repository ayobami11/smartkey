import { fillShiftReport } from '@/lib/ai/reports/generate';
import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';

/** Placeholder marker written by `schedule_pending_shift_report()`. */
const PENDING = 'PENDING_GENERATION';

const MAX_PER_RUN = 5;

/**
 * After this many failed generations the cron stops retrying a placeholder.
 * The CSO's "Generate now" (`POST /api/reports/generate`) still adopts it.
 */
const MAX_ATTEMPTS = 5;

/** Longest error text kept in `metadata.last_generation_error`. */
const MAX_ERROR_LENGTH = 200;

type Metadata = Record<string, unknown>;

const asMetadata = (value: unknown): Metadata =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Metadata)
    : {};

const attemptsOf = (metadata: Metadata): number => {
  const n = metadata.generation_attempts;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
};

export const POST = route({
  name: 'shift-report',
  auth: 'cron',
  handler: async () => {
    const admin = createAdminClient();

    // Fewest failed attempts first, then oldest. A placeholder whose
    // generation keeps throwing gains an attempt each run and sinks behind
    // fresh ones, so it can no longer hold a slot every run and starve the
    // queue. A placeholder with no attempts has no key, hence nullsFirst.
    const { data: pending, error: pendingError } = await admin
      .from('shift_reports')
      .select('id, shift_id, metadata')
      .eq('markdown', PENDING)
      .order('metadata->generation_attempts', {
        ascending: true,
        nullsFirst: true,
      })
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
      const metadata = asMetadata(row.metadata);
      const attempts = attemptsOf(metadata);

      // Ordering puts these last, so reaching one means nothing fresher is
      // waiting. Leave it for a person rather than retry it forever.
      if (attempts >= MAX_ATTEMPTS) {
        logger.warn('shift-report: placeholder past retry limit, skipped', {
          reportId: row.id,
          shiftId: row.shift_id,
          attempts,
        });
        continue;
      }

      try {
        await fillShiftReport(admin, {
          shiftId: row.shift_id,
          reportId: row.id,
        });
        generated += 1;
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        logger.error('shift-report: generation failed for report', {
          reportId: row.id,
          shiftId: row.shift_id,
          attempt: attempts + 1,
          err: message,
        });

        // Record the attempt on the placeholder. Guarded on the marker so a
        // report filled in meanwhile is never touched; a successful
        // generation later replaces metadata wholesale.
        const { error: recordError } = await admin
          .from('shift_reports')
          .update({
            metadata: {
              ...metadata,
              generation_attempts: attempts + 1,
              last_generation_error: message.slice(0, MAX_ERROR_LENGTH),
              last_attempt_at: new Date().toISOString(),
            } as never,
          })
          .eq('id', row.id)
          .eq('markdown', PENDING);

        if (recordError) {
          logger.error('shift-report: failed to record attempt', {
            reportId: row.id,
            err: recordError.message,
          });
        }
      }
    }

    logger.info('shift-report: run complete', { generated, failed });

    return respond.ok({ generated, failed });
  },
});
