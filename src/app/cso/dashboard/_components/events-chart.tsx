'use client';

import { useMemo, useState } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import {
  EVENT_TYPE_LABELS,
  getEventType,
  type AuditEventType,
} from '@/lib/audit/event-types';
import { formatDateShort, subDaysISO } from '@/lib/dates';
import { createBrowserClient } from '@/lib/supabase/client';
import { useConnectionStatus } from '@/hooks/use-connection-status';
import { useRealtime } from '@/hooks/use-realtime';

import { Button } from '@/components/ui/button';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

// Types

type EventTypeFilter = AuditEventType | 'ALL';
type RawBucket = {
  date: string;
  label: string;
  counts: Record<AuditEventType, number>;
};
type DayBucket = { date: string; label: string; count: number };

const DAYS = 14;
// Neutral, informational tone — this is an operational metric, not a status
// signal, so it deliberately sits outside the emerald/amber/destructive
// vocabulary used elsewhere on this dashboard.
const ACTIVITY_COLOR = '#64748b';

const ALL_EVENT_TYPES = Object.keys(EVENT_TYPE_LABELS) as AuditEventType[];

const activityChartConfig: ChartConfig = {
  count: { label: 'Events' },
};

const QUERY_KEY = ['cso', 'activity-volume'];

const emptyCounts = (): Record<AuditEventType, number> =>
  Object.fromEntries(ALL_EVENT_TYPES.map((t) => [t, 0])) as Record<
    AuditEventType,
    number
  >;

const bucketByDayAndType = (
  rows: { occurred_at: string; event: string }[]
): RawBucket[] => {
  const buckets = new Map<string, RawBucket>();
  for (let i = DAYS - 1; i >= 0; i--) {
    const iso = subDaysISO(i);
    const key = iso.slice(0, 10);
    buckets.set(key, {
      date: key,
      label: formatDateShort(iso),
      counts: emptyCounts(),
    });
  }
  rows.forEach((row) => {
    const key = row.occurred_at.slice(0, 10);
    const bucket = buckets.get(key);
    if (bucket) bucket.counts[getEventType(row.event)]++;
  });
  return [...buckets.values()];
};

// Component

export const EventsChart = () => {
  const connectionStatus = useConnectionStatus();
  const queryClient = useQueryClient();
  const [selectedType, setSelectedType] = useState<EventTypeFilter>('ALL');

  useRealtime({
    table: 'audit_log',
    onInsert: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const {
    data: rawBuckets = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: QUERY_KEY,
    refetchInterval: connectionStatus !== 'connected' ? 10_000 : false,
    queryFn: async (): Promise<RawBucket[]> => {
      const supabase = createBrowserClient();
      const { data, error: queryError } = await supabase
        .from('audit_log')
        .select('occurred_at, event')
        .gte('occurred_at', subDaysISO(DAYS - 1))
        .order('occurred_at', { ascending: true });

      if (queryError) throw new Error('Failed to load activity data.');

      return bucketByDayAndType(data ?? []);
    },
  });

  // Switching the dropdown never refetches — every category's count for
  // every day is already in rawBuckets, so this is a pure client-side derive.
  const buckets = useMemo<DayBucket[]>(
    () =>
      rawBuckets.map((b) => ({
        date: b.date,
        label: b.label,
        count:
          selectedType === 'ALL'
            ? Object.values(b.counts).reduce((sum, c) => sum + c, 0)
            : b.counts[selectedType],
      })),
    [rawBuckets, selectedType]
  );

  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  const dailyAvg = buckets.length > 0 ? Math.round(total / buckets.length) : 0;
  const peak = buckets.reduce((max, b) => (b.count > max.count ? b : max), {
    date: '',
    label: '',
    count: 0,
  });
  const filterLabel =
    selectedType === 'ALL' ? null : EVENT_TYPE_LABELS[selectedType];
  // "20 June - 3 July 2026" — the exact 14-day window rawBuckets covers.
  const dateRangeLabel =
    rawBuckets.length > 0
      ? `${format(new Date(rawBuckets[0].date), 'd MMMM')} - ${format(
          new Date(rawBuckets[rawBuckets.length - 1].date),
          'd MMMM yyyy'
        )}`
      : '';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Events</h2>
          <p className="text-sm text-muted-foreground">{dateRangeLabel}</p>
        </div>
        <Select
          value={selectedType}
          onValueChange={(v) => setSelectedType(v as EventTypeFilter)}
        >
          <SelectTrigger size="sm" aria-label="Filter activity by event type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All events</SelectItem>
            {ALL_EVENT_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {EVENT_TYPE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-[0_2px_4px_rgba(15,23,42,0.06)]">
          <div
            role="img"
            aria-label={`Audit log activity${filterLabel ? ` for ${filterLabel}` : ''}, last ${DAYS} days: total ${total} events, daily average ${dailyAvg}, peak ${peak.count} on ${peak.label}`}
          >
            <ChartContainer
              config={activityChartConfig}
              className="aspect-auto! h-48 w-full"
            >
              <AreaChart data={buckets} margin={{ left: 0, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  width={28}
                />
                <ChartTooltip
                  content={<ChartTooltipContent indicator="dot" />}
                />
                <Area
                  dataKey="count"
                  type="monotone"
                  stroke={ACTIVITY_COLOR}
                  fill={ACTIVITY_COLOR}
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          </div>
        </div>
      )}
    </div>
  );
};
