import type { SupabaseClient } from '@supabase/supabase-js';

import { logger } from '@/lib/logger';
import type { Database } from '@/lib/supabase/types';

import { generateShiftReport } from './client';
import type { ReportEvent, ReportMetadata } from './types';

/** Defensive cap on the audit events fed into a single report prompt. */
const MAX_EVENTS = 2000;

export const fillShiftReport = async (
  admin: SupabaseClient<Database>,
  { shiftId, reportId }: { shiftId: string; reportId: string }
): Promise<ReportMetadata> => {
  const { data: shift } = await admin
    .from('shifts')
    .select('started_at, ended_at')
    .eq('id', shiftId)
    .maybeSingle();

  // Bound the window at both ends. An unbounded upper end would sweep every
  // event recorded since the shift began into a report about that shift — for
  // an old shift, that is months of unrelated activity.
  const windowStart = shift?.started_at ?? new Date(0).toISOString();
  const windowEnd = shift?.ended_at ?? new Date().toISOString();

  const { data: events, error: eventsError } = await admin
    .from('audit_log')
    .select('event, actor_role, target_type, target_id, payload, occurred_at')
    .gte('occurred_at', windowStart)
    .lte('occurred_at', windowEnd)
    .order('occurred_at', { ascending: true })
    .limit(MAX_EVENTS);

  if (eventsError) {
    logger.warn('Shift report: audit event query failed; generating empty', {
      shiftId,
      reportId,
      err: eventsError.message,
    });
  }

  const report = await generateShiftReport(
    shiftId,
    (events ?? []) as ReportEvent[]
  );

  const { error: updateError } = await admin
    .from('shift_reports')
    .update({
      markdown: report.markdown,
      timeline: report.timeline as never,
      metadata: report.metadata as never,
    })
    .eq('id', reportId);

  if (updateError) {
    logger.error('Shift report: failed to persist generated content', {
      shiftId,
      reportId,
      err: updateError.message,
    });
    throw new Error(`Failed to persist shift report: ${updateError.message}`);
  }

  return report.metadata;
};
