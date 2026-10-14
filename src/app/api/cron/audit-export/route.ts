import { put } from '@vercel/blob';

import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';

const MAX_ROWS_PER_RUN = 20_000;

const STATE_ID = '00000000-0000-0000-0000-000000000003';

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

export const POST = route({
  name: 'audit-export',
  auth: 'cron',
  handler: async () => {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return respond.internal(
        'audit-export: BLOB_READ_WRITE_TOKEN not configured'
      );
    }

    const admin = createAdminClient();

    const { data: state, error: stateError } = await admin
      .from('audit_export_state')
      .select('last_exported_through')
      .eq('id', STATE_ID)
      .single();

    if (stateError || !state) {
      return respond.internal('audit-export: failed to read watermark', {
        err: stateError?.message,
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
      return respond.internal('audit-export: audit_log query failed', {
        err: rowsError.message,
      });
    }

    if (!rows || rows.length === 0) {
      return respond.ok({ exported_days: 0, exported_rows: 0 });
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
        logger.error('audit-export: blob upload failed', {
          ref: crypto.randomUUID(),
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
        .eq('id', STATE_ID);

      if (watermarkError) {
        logger.error('audit-export: failed to advance watermark', {
          ref: crypto.randomUUID(),
          date,
          err: watermarkError.message,
        });
        break;
      }

      exportedDays += 1;
      exportedRows += dayRows.length;
    }

    return respond.ok({
      exported_days: exportedDays,
      exported_rows: exportedRows,
    });
  },
});
