import Link from 'next/link';
import {
  BotIcon,
  DownloadIcon,
  FileTextIcon,
  FlagIcon,
  KeyRoundIcon,
  RotateCcwIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { createServerClient } from '@/lib/supabase/server';

type Report = {
  id: string;
  shift: number;
  date: string;
  timeRange: string;
  officers: string[];
  issued: number;
  returned: number;
  flagged: number;
};

const filterChips = [
  'All',
  'Last 7 days',
  'Last 30 days',
  'Has incidents',
  'Has anomalies',
];

export default async function ShiftReportsPage() {
  const supabase = await createServerClient();

  const { data: reportRows } = await supabase
    .from('shift_reports')
    .select(
      'id, shift_id, generated_at, metadata, shift:shifts!shift_id(shift_number, started_at, ended_at, primary_officer:profiles!primary_officer_id(full_name), secondary_officer:profiles!secondary_officer_id(full_name))'
    )
    .order('generated_at', { ascending: false })
    .limit(20);

  const groups: Record<string, Record<string, unknown>[]> = {};
  (reportRows ?? []).forEach((r: Record<string, unknown>) => {
    const dateKey = new Date(r.generated_at as string).toLocaleDateString(
      'en-GB',
      {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }
    );
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(r);
  });

  const reportGroups: { day: string; items: Report[] }[] = Object.entries(
    groups
  ).map(([day, items]) => ({
    day,
    items: (items ?? []).map((r: Record<string, unknown>) => {
      const meta =
        typeof r.metadata === 'object' && r.metadata !== null
          ? (r.metadata as Record<string, unknown>)
          : {};
      type ShiftRow = {
        shift_number: number;
        started_at: string;
        ended_at: string | null;
        primary_officer: { full_name: string } | null;
        secondary_officer: { full_name: string } | null;
      };
      const shift = r.shift as ShiftRow | null;
      const startTime = shift?.started_at
        ? new Date(shift.started_at).toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
          })
        : '—';
      const endTime = shift?.ended_at
        ? new Date(shift.ended_at).toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
          })
        : 'ongoing';
      const officers = [
        shift?.primary_officer?.full_name,
        shift?.secondary_officer?.full_name,
      ].filter((n): n is string => Boolean(n));
      return {
        id: r.id as string,
        shift: shift?.shift_number ?? 0,
        date: new Date(r.generated_at as string).toLocaleDateString('en-GB', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
        timeRange: `${startTime}–${endTime}`,
        officers,
        issued: typeof meta.issued_count === 'number' ? meta.issued_count : 0,
        returned:
          typeof meta.returned_count === 'number' ? meta.returned_count : 0,
        flagged:
          typeof meta.flagged_count === 'number' ? meta.flagged_count : 0,
      };
    }),
  }));

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Shift Reports
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            AI-generated summaries of key events, flagged incidents, and
            chain-of-custody logs per shift.
          </p>
        </div>
        <Button>
          <FileTextIcon className="size-4" aria-hidden="true" />
          Generate report now
        </Button>
      </div>

      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Filter reports"
      >
        {filterChips.map((chip, idx) => (
          <button
            key={chip}
            type="button"
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
              idx === 0
                ? 'bg-primary text-primary-foreground'
                : 'border border-border bg-card text-foreground hover:bg-muted'
            }`}
            aria-pressed={idx === 0}
          >
            {chip}
          </button>
        ))}
      </div>

      {reportGroups.length === 0 ? (
        <div className="flex items-center justify-center rounded-lg border border-border bg-card p-12 text-center">
          <p className="text-sm text-muted-foreground">
            No shift reports generated yet.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {reportGroups.map((group) => (
            <div key={group.day} className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.day}
              </h2>
              {group.items.map((report) => (
                <Link
                  key={report.id}
                  href={`/cso/reports/${report.id}`}
                  className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-[0_2px_4px_rgba(15,23,42,0.06)] transition-shadow hover:shadow-[0_4px_8px_rgba(15,23,42,0.08)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold text-foreground">
                        Shift {report.shift} — {report.date}, {report.timeRange}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {report.officers.join(', ')}
                      </span>
                    </div>
                    <DownloadIcon
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <KeyRoundIcon
                        className="size-3.5 text-primary"
                        aria-hidden="true"
                      />
                      {report.issued} issued
                    </span>
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <RotateCcwIcon
                        className="size-3.5 text-emerald-600"
                        aria-hidden="true"
                      />
                      {report.returned} returned
                    </span>
                    {report.flagged > 0 && (
                      <span className="flex items-center gap-1.5 text-destructive">
                        <FlagIcon className="size-3.5" aria-hidden="true" />
                        {report.flagged} flagged
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <BotIcon className="size-3.5" aria-hidden="true" />
                    <span>Generated by AI from shift event data</span>
                  </div>
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
