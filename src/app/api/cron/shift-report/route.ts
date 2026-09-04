import { NextRequest, NextResponse } from 'next/server';

import { fillShiftReport } from '@/lib/ai/reports/generate';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { err, ok } from '@/types/api';

/** Placeholder marker written by `schedule_pending_shift_report()`. */
const PENDING = 'PENDING_GENERATION';

const MAX_PER_RUN = 5;

export const POST = async (request: NextRequest) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    const ref = crypto.randomUUID();
    logger.error('shift-report: CRON_SECRET not configured', { ref });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });
  }

  const admin = createAdminClient();

  const { data: pending, error: pendingError } = await admin
    .from('shift_reports')
    .select('id, shift_id')
    .eq('markdown', PENDING)
    .order('generated_at', { ascending: true })
    .limit(MAX_PER_RUN);

  if (pendingError) {
    const ref = crypto.randomUUID();
    logger.error('shift-report: pending query failed', {
      ref,
      err: pendingError.message,
    });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  let generated = 0;
  let failed = 0;

  // Sequential, not Promise.all: each iteration is a Gemini call, and one bad
  // row must not abort the rest of the backlog.
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

  return NextResponse.json(ok({ generated, failed }), { status: 200 });
};
