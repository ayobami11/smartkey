import { put } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { err, ok } from '@/types/api';

const MAX_ROWS_PER_RUN = 20_000;

type AuditRow = {
  id: string;
  event: string;
  actor_id: string | null;
  actor_role: string | null;
  actor_name: string | null;
  actor_department: string | null;
  target_type: string;
  target_id: string;
  payload: unknown;
  occurred_at: string;
};

const utcDateKey = (iso: string): string => iso.slice(0, 10); // YYYY-MM-DD

export const POST = async (request: NextRequest) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    const ref = crypto.randomUUID();
    logger.error('audit-export: CRON_SECRET not configured', { ref });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    const ref = crypto.randomUUID();
    logger.error('audit-export: BLOB_READ_WRITE_TOKEN not configured', {
      ref,
    });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  const admin = createAdminClient();

  const { data: state, error: stateError } = await admin
    .from('audit_export_state')
    .select('last_exported_through')
    .eq('id', '00000000-0000-0000-0000-000000000003')
    .single();

  if (stateError || !state) {
    const ref = crypto.randomUUID();
    logger.error('audit-export: failed to read watermark', {
      ref,
      err: stateError?.message,
    });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  // Only fully-completed UTC calendar days — a day is exported exactly
  // once. Blob has no append, so re-exporting a partial day and later
  // completing it would need overwrite/merge logic this avoids entirely.
  const todayUtcMidnight = new Date();
  todayUtcMidnight.setUTCHours(0, 0, 0, 0);

  const { data: rows, error: rowsError } = await admin
    .from('audit_log')
    .select(
      'id, event, actor_id, actor_role, actor_name, actor_department, target_type, target_id, payload, occurred_at'
    )
    .gt('occurred_at', state.last_exported_through)
    .lt('occurred_at', todayUtcMidnight.toISOString())
    .order('occurred_at', { ascending: true })
    .limit(MAX_ROWS_PER_RUN);

  if (rowsError) {
    const ref = crypto.randomUUID();
    logger.error('audit-export: audit_log query failed', {
      ref,
      err: rowsError.message,
    });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json(ok({ exported_days: 0, exported_rows: 0 }));
  }

  const byDate = new Map<string, AuditRow[]>();
  for (const row of rows as AuditRow[]) {
    const key = utcDateKey(row.occurred_at);
    const existing = byDate.get(key);
    if (existing) existing.push(row);
    else byDate.set(key, [row]);
  }
  const sortedDates = [...byDate.keys()].sort();

  let exportedDays = 0;
  let exportedRows = 0;

  for (const date of sortedDates) {
    const dayRows = byDate.get(date)!;
    const ndjson = dayRows.map((r) => JSON.stringify(r)).join('\n') + '\n';

    try {
      await put(`audit-log/${date}.ndjson`, ndjson, {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/x-ndjson',
      });
    } catch (e) {
      const ref = crypto.randomUUID();
      logger.error('audit-export: blob upload failed', {
        ref,
        date,
        err: e instanceof Error ? e.message : String(e),
      });
      // Stop here — don't advance the watermark past a day that failed to
      // upload. Already-succeeded earlier days keep their progress.
      break;
    }

    const nextWatermark = new Date(`${date}T00:00:00.000Z`);
    nextWatermark.setUTCDate(nextWatermark.getUTCDate() + 1);

    const { error: watermarkError } = await admin
      .from('audit_export_state')
      .update({
        last_exported_through: nextWatermark.toISOString(),
        last_run_at: new Date().toISOString(),
      })
      .eq('id', '00000000-0000-0000-0000-000000000003');

    if (watermarkError) {
      const ref = crypto.randomUUID();
      logger.error('audit-export: failed to advance watermark', {
        ref,
        date,
        err: watermarkError.message,
      });
      break;
    }

    exportedDays += 1;
    exportedRows += dayRows.length;
  }

  return NextResponse.json(
    ok({ exported_days: exportedDays, exported_rows: exportedRows })
  );
};
