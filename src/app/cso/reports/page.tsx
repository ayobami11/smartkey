'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BotIcon,
  CalendarIcon,
  DownloadIcon,
  FileTextIcon,
  FlagIcon,
  KeyRoundIcon,
  RotateCcwIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { createBrowserClient } from '@/lib/supabase/client';

// Types

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

type DateFilter = 'all' | '7d' | '30d';

type ShiftOption = { id: string; label: string };

// Helpers

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });

function groupByDay(reports: Report[]): { day: string; items: Report[] }[] {
  const groups: Record<string, Report[]> = {};
  reports.forEach((r) => {
    if (!groups[r.date]) groups[r.date] = [];
    groups[r.date].push(r);
  });
  return Object.entries(groups).map(([day, items]) => ({ day, items }));
}

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

export default function ShiftReportsPage() {
  const [reportGroups, setReportGroups] = useState<
    { day: string; items: Report[] }[]
  >([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>(
    'loading'
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');

  // Generate sheet
  const [generateOpen, setGenerateOpen] = useState(false);
  const [shifts, setShifts] = useState<ShiftOption[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generatedReportId, setGeneratedReportId] = useState<string | null>(
    null
  );

  // Fetch reports

  const fetchReports = async (reset = true, cursor?: string) => {
    if (reset) setLoadState('loading');
    setFetchError(null);

    const params = new URLSearchParams({ limit: '20' });
    if (dateFilter === '7d') {
      params.set(
        'from',
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      );
    } else if (dateFilter === '30d') {
      params.set(
        'from',
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      );
    }
    if (cursor) params.set('cursor', cursor);

    try {
      const res = await fetch(`/api/reports?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        setFetchError(json.error ?? 'Failed to load reports.');
        setLoadState('error');
        return;
      }
      const incoming: Report[] = (
        (json.data?.reports ?? []) as Record<string, unknown>[]
      ).map(mapReport);
      setNextCursor(json.data?.next_cursor ?? null);

      if (reset) {
        setReportGroups(groupByDay(incoming));
      } else {
        setReportGroups((prev) => {
          const all = prev.flatMap((g) => g.items).concat(incoming);
          return groupByDay(all);
        });
      }
      setLoadState('ready');
    } catch {
      setFetchError('Something went wrong. Check your connection.');
      setLoadState('error');
    }
  };

  useEffect(() => {
    fetchReports(true);
  }, [dateFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load more

  const handleLoadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    await fetchReports(false, nextCursor);
    setLoadingMore(false);
  };

  // Fetch shifts (for generate sheet)

  const fetchShifts = async () => {
    const supabase = createBrowserClient();
    const { data } = await supabase
      .from('shifts')
      .select('id, shift_number, started_at')
      .order('started_at', { ascending: false })
      .limit(20);

    setShifts(
      (data ?? []).map((s) => ({
        id: s.id,
        label: `Shift ${s.shift_number} — ${formatDate(s.started_at)}`,
      }))
    );
  };

  const handleOpenGenerate = () => {
    setGenerateOpen(true);
    setSelectedShiftId('');
    setGenerateError(null);
    setGeneratedReportId(null);
    fetchShifts();
  };

  // Generate report

  const handleGenerate = async () => {
    if (!selectedShiftId) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shift_id: selectedShiftId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setGenerateError(json.error ?? 'Failed to generate report.');
        return;
      }
      setGeneratedReportId(json.data?.report_id ?? null);
      fetchReports(true);
    } catch {
      setGenerateError('Something went wrong. Check your connection.');
    } finally {
      setGenerating(false);
    }
  };

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
        <Button onClick={handleOpenGenerate}>
          <FileTextIcon className="size-4" aria-hidden="true" />
          Generate report now
        </Button>
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
      {loadState === 'loading' && (
        <div className="flex flex-col gap-4" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      )}

      {/* Error */}
      {loadState === 'error' && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4"
          role="alert"
        >
          <p className="text-sm font-medium text-destructive">
            Failed to load reports
          </p>
          {fetchError && (
            <p className="mt-1 text-xs text-destructive/80">{fetchError}</p>
          )}
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => fetchReports(true)}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Content */}
      {loadState === 'ready' && (
        <>
          {reportGroups.length === 0 ? (
            <Empty className="border border-border bg-card">
              <EmptyMedia variant="icon">
                <FileTextIcon
                  className="size-8 text-muted-foreground"
                  aria-hidden="true"
                />
              </EmptyMedia>
              <EmptyContent>
                <EmptyTitle>No shift reports yet</EmptyTitle>
                <EmptyDescription>
                  Generate your first shift report to see it here.
                </EmptyDescription>
              </EmptyContent>
            </Empty>
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
                            Shift {report.shift} — {report.date},{' '}
                            {report.timeRange}
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

          {nextCursor && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={handleLoadMore}
                disabled={loadingMore}
                aria-busy={loadingMore}
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Generate report Sheet */}
      <Sheet open={generateOpen} onOpenChange={setGenerateOpen}>
        <SheetContent
          side="right"
          className="flex flex-col gap-0 p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b border-border p-6">
            <SheetTitle>Generate shift report</SheetTitle>
            <SheetDescription>
              Select a completed shift to generate an AI-powered summary.
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
            {generatedReportId ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40">
                  <CalendarIcon
                    className="size-6 text-emerald-600"
                    aria-hidden="true"
                  />
                </div>
                <p className="font-medium text-foreground">Report generated</p>
                <Link
                  href={`/cso/reports/${generatedReportId}`}
                  className="text-sm text-primary underline-offset-4 hover:underline"
                >
                  View report
                </Link>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="shift-select">Shift</Label>
                  <Select
                    value={selectedShiftId}
                    onValueChange={setSelectedShiftId}
                  >
                    <SelectTrigger id="shift-select">
                      <SelectValue placeholder="Select a shift…" />
                    </SelectTrigger>
                    <SelectContent>
                      {shifts.length === 0 ? (
                        <SelectItem value="__none" disabled>
                          No shifts available
                        </SelectItem>
                      ) : (
                        shifts.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.label}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                {generateError && (
                  <p className="text-sm text-destructive" role="alert">
                    {generateError}
                  </p>
                )}
              </>
            )}
          </div>
          <SheetFooter className="border-t border-border p-6">
            {generatedReportId ? (
              <SheetClose asChild>
                <Button className="w-full">Close</Button>
              </SheetClose>
            ) : (
              <>
                <SheetClose asChild>
                  <Button variant="outline">Cancel</Button>
                </SheetClose>
                <Button
                  disabled={!selectedShiftId || generating}
                  aria-busy={generating}
                  onClick={handleGenerate}
                >
                  {generating ? 'Generating…' : 'Generate'}
                </Button>
              </>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
