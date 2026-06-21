'use client';

import { useState } from 'react';

import { useInfiniteQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import { GenerateReportDialog } from '@/app/cso/reports/_components/generate-report-dialog';
import { ReportsEmpty } from '@/app/cso/reports/_components/reports-empty';
import {
  formatDate,
  formatTime,
  groupByDay,
  ReportsList,
  type Report,
} from '@/app/cso/reports/_components/reports-list';

// Types

type DateFilter = 'all' | '7d' | '30d';

// Helpers

function mapReport(r: Record<string, unknown>): Report {
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
  const startTime = shift?.started_at ? formatTime(shift.started_at) : '—';
  const endTime = shift?.ended_at ? formatTime(shift.ended_at) : 'ongoing';
  const officers = [
    shift?.primary_officer?.full_name,
    shift?.secondary_officer?.full_name,
  ].filter((n): n is string => Boolean(n));

  return {
    id: r.id as string,
    shift: shift?.shift_number ?? 0,
    date: formatDate(r.generated_at as string),
    timeRange: `${startTime}–${endTime}`,
    officers,
    issued: typeof meta.issued_count === 'number' ? meta.issued_count : 0,
    returned: typeof meta.returned_count === 'number' ? meta.returned_count : 0,
    flagged: typeof meta.flagged_count === 'number' ? meta.flagged_count : 0,
  };
}

const DATE_FILTER_LABELS: Record<DateFilter, string> = {
  all: 'All',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
};

// Component

export const ReportsView = () => {
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');

  // Reports query — infinite scroll with cursor pagination

  const {
    data: reportsData,
    isLoading: reportsLoading,
    isError: reportsIsError,
    error: reportsError,
    refetch: refetchReports,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['cso', 'reports', dateFilter],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '20' });
      if (dateFilter === '7d')
        params.set(
          'from',
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        );
      else if (dateFilter === '30d')
        params.set(
          'from',
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        );
      if (pageParam) params.set('cursor', pageParam);

      const res = await fetch(`/api/reports?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load reports.');

      return {
        reports: ((json.data?.reports ?? []) as Record<string, unknown>[]).map(
          mapReport
        ),
        nextCursor: (json.data?.next_cursor as string | null) ?? null,
      };
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 5 * 60_000,
  });

  const allReports = reportsData?.pages.flatMap((p) => p.reports) ?? [];
  const reportGroups = groupByDay(allReports);

  // Render

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
        <GenerateReportDialog onGenerated={() => refetchReports()} />
      </div>

      {/* Date filter chips */}
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Filter reports by date"
      >
        {(['all', '7d', '30d'] as DateFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setDateFilter(f)}
            aria-pressed={dateFilter === f}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
              dateFilter === f
                ? 'bg-primary text-primary-foreground'
                : 'border border-border bg-card text-foreground hover:bg-muted'
            }`}
          >
            {DATE_FILTER_LABELS[f]}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={false}
          disabled
          title="Not yet available"
          className="cursor-not-allowed rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground opacity-50"
        >
          Has incidents
        </button>
        <button
          type="button"
          aria-pressed={false}
          disabled
          title="Not yet available"
          className="cursor-not-allowed rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground opacity-50"
        >
          Has anomalies
        </button>
      </div>

      {/* Loading */}
      {reportsLoading && (
        <div className="flex flex-col gap-4" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      )}

      {/* Error */}
      {reportsIsError && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4"
          role="alert"
        >
          <p className="text-sm font-medium text-destructive">
            Failed to load reports
          </p>
          {reportsError instanceof Error && (
            <p className="mt-1 text-xs text-destructive/80">
              {reportsError.message}
            </p>
          )}
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => refetchReports()}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Content */}
      {!reportsLoading &&
        !reportsIsError &&
        (reportGroups.length === 0 ? (
          <ReportsEmpty />
        ) : (
          <ReportsList
            reportGroups={reportGroups}
            hasNextPage={!!hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
          />
        ))}
    </div>
  );
};
