'use client';

import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CheckCircleIcon } from 'lucide-react';
import { Bar, BarChart, Cell, XAxis, YAxis } from 'recharts';

import { apiFetch } from '@/lib/api';
import { subDaysISO } from '@/lib/dates';
import { useConnectionStatus } from '@/hooks/use-connection-status';

import { Button } from '@/components/ui/button';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';

// Types

type Incident = { severity: 'LOW' | 'MEDIUM' | 'HIGH' };
type IncidentsResponse = { incidents: Incident[]; next_cursor: string | null };

type SeverityRow = { severity: 'LOW' | 'MEDIUM' | 'HIGH'; count: number };

// Same LOW/MEDIUM/HIGH vocabulary as RiskTierBadge's TIER_CONFIG — matching
// hex values for emerald-500/amber-500; --destructive is the one real CSS var
// this codebase has for a status colour. SVG fill needs a real colour value,
// not a Tailwind class.
const SEVERITY_COLORS: Record<SeverityRow['severity'], string> = {
  LOW: '#10b981',
  MEDIUM: '#f59e0b',
  HIGH: 'var(--destructive)',
};

const SEVERITY_LABELS: Record<SeverityRow['severity'], string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
};

const severityChartConfig: ChartConfig = {
  count: { label: 'Incidents' },
};

const QUERY_KEY = ['cso', 'incident-severity'];
const MAX_PAGES = 3; // safety net if 30-day volume ever exceeds one page
const WINDOW_DAYS = 30;

// Component

export const IncidentsChart = () => {
  const connectionStatus = useConnectionStatus();

  // "4 June - 3 July 2026" — the exact window the incidents query covers.
  const dateRangeLabel = `${format(new Date(subDaysISO(WINDOW_DAYS)), 'd MMMM')} - ${format(
    new Date(),
    'd MMMM yyyy'
  )}`;

  const {
    data: rows = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: QUERY_KEY,
    refetchInterval: connectionStatus !== 'connected' ? 10_000 : false,
    queryFn: async (): Promise<SeverityRow[]> => {
      const from = encodeURIComponent(subDaysISO(WINDOW_DAYS));
      const counts: Record<SeverityRow['severity'], number> = {
        LOW: 0,
        MEDIUM: 0,
        HIGH: 0,
      };

      let cursor: string | null = null;
      for (let page = 0; page < MAX_PAGES; page++) {
        const url = `/api/incidents?from=${from}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
        const result: Awaited<ReturnType<typeof apiFetch<IncidentsResponse>>> =
          await apiFetch<IncidentsResponse>(url);
        if (result.error || !result.data)
          throw new Error(result.error ?? 'Failed to load incidents.');

        result.data.incidents.forEach((incident) => {
          counts[incident.severity]++;
        });

        cursor = result.data.next_cursor;
        if (!cursor) break;
      }

      return (['LOW', 'MEDIUM', 'HIGH'] as const).map((severity) => ({
        severity,
        count: counts[severity],
      }));
    },
  });

  const total = rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Incidents</h2>
        <p className="text-sm text-muted-foreground">{dateRangeLabel}</p>
      </div>

      {isLoading && (
        <div aria-busy="true">
          <Skeleton className="h-48 rounded-lg" />
        </div>
      )}

      {!!error && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4"
          role="alert"
        >
          <p className="text-sm text-destructive">{(error as Error).message}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => refetch()}
          >
            Retry
          </Button>
        </div>
      )}

      {!isLoading && !error && (
        <>
          {total === 0 ? (
            <Empty className="border border-border bg-card">
              <EmptyMedia variant="icon">
                <CheckCircleIcon
                  className="size-8 text-emerald-600"
                  aria-hidden="true"
                />
              </EmptyMedia>
              <EmptyContent>
                <EmptyTitle>No incidents logged</EmptyTitle>
                <EmptyDescription>
                  No incidents in the last {WINDOW_DAYS} days.
                </EmptyDescription>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-[0_2px_4px_rgba(15,23,42,0.06)]">
              <div
                role="img"
                aria-label={`Incident severity, last ${WINDOW_DAYS} days: ${rows
                  .map(
                    (r) =>
                      `${r.count} ${SEVERITY_LABELS[r.severity].toLowerCase()}`
                  )
                  .join(', ')}`}
              >
                <ChartContainer
                  config={severityChartConfig}
                  className="aspect-auto! h-48 w-full"
                >
                  <BarChart data={rows} margin={{ left: 0, right: 8 }}>
                    <XAxis
                      dataKey="severity"
                      tickFormatter={(v: SeverityRow['severity']) =>
                        SEVERITY_LABELS[v]
                      }
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis allowDecimals={false} hide />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          indicator="dot"
                          labelFormatter={(v) =>
                            SEVERITY_LABELS[v as SeverityRow['severity']] ??
                            String(v)
                          }
                        />
                      }
                    />
                    <Bar dataKey="count" radius={4}>
                      {rows.map((r) => (
                        <Cell
                          key={r.severity}
                          fill={SEVERITY_COLORS[r.severity]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
