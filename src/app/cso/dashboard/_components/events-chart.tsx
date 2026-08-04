'use client';

import { useMemo, useState } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  eachDayOfInterval,
  eachHourOfInterval,
  eachWeekOfInterval,
  format,
  startOfDay,
  startOfHour,
  startOfWeek,
} from 'date-fns';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import {
  EVENT_TYPE_LABELS,
  getEventType,
  type AuditEventType,
} from '@/lib/audit/event-types';
import {
  bucketUnitForRange,
  formatRangeLabel,
  type BucketUnit,
  type DateRange,
} from '@/lib/date-range';
import { createBrowserClient } from '@/lib/supabase/client';
import { useConnectionStatus } from '@/hooks/use-connection-status';
import { useDebouncedCallback } from '@/hooks/use-debounce';
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

type EventsChartProps = { range: DateRange };

// Neutral, informational tone — this is an operational metric, not a status
// signal, so it deliberately sits outside the emerald/amber/destructive
// vocabulary used elsewhere on this dashboard.
const ACTIVITY_COLOR = '#64748b';

const ALL_EVENT_TYPES = Object.keys(EVENT_TYPE_LABELS) as AuditEventType[];

const activityChartConfig: ChartConfig = {
  count: { label: 'Events' },
};

const UNIT_ADJECTIVE: Record<BucketUnit, string> = {
  hour: 'hourly',
  day: 'daily',
  week: 'weekly',
};

const QUERY_KEY_BASE = ['cso', 'activity-volume'];

const emptyCounts = (): Record<AuditEventType, number> =>
  Object.fromEntries(ALL_EVENT_TYPES.map((t) => [t, 0])) as Record<
    AuditEventType,
    number
  >;

// Bucket-start key + x-axis label for a given point in time, at the given
// granularity.
const bucketKeyAndLabel = (
  date: Date,
  unit: BucketUnit
): { key: string; label: string } => {
  if (unit === 'hour') {
    return {
      key: startOfHour(date).toISOString(),
      label: format(date, 'HH:mm'),
    };
  }
  if (unit === 'week') {
    const start = startOfWeek(date, { weekStartsOn: 1 });
    return { key: start.toISOString(), label: format(start, 'd MMM') };
  }
  const start = startOfDay(date);
  return { key: start.toISOString(), label: format(start, 'd MMM') };
};

const bucketPoints = (range: DateRange, unit: BucketUnit): Date[] => {
  const start = new Date(range.from);
  const end = new Date(range.to);
  if (unit === 'hour') return eachHourOfInterval({ start, end });
  if (unit === 'week')
    return eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
  return eachDayOfInterval({ start, end });
};

const bucketEvents = (
  rows: { occurred_at: string; event: string }[],
  range: DateRange,
  unit: BucketUnit
): RawBucket[] => {
  const buckets = new Map<string, RawBucket>();
  bucketPoints(range, unit).forEach((point) => {
    const { key, label } = bucketKeyAndLabel(point, unit);
    if (!buckets.has(key))
      buckets.set(key, { date: key, label, counts: emptyCounts() });
  });
  rows.forEach((row) => {
    const { key } = bucketKeyAndLabel(new Date(row.occurred_at), unit);
    const bucket = buckets.get(key);
    if (bucket) bucket.counts[getEventType(row.event)]++;
  });
  return [...buckets.values()];
};

// Component

export const EventsChart = ({ range }: EventsChartProps) => {
  const connectionStatus = useConnectionStatus();
  const queryClient = useQueryClient();
  const [selectedType, setSelectedType] = useState<EventTypeFilter>('ALL');
  const unit = bucketUnitForRange(range);

  // This chart genuinely wants every audit event, so it cannot narrow with a
  // server-side filter the way the signature-mismatch panel does. Debounce
  // instead: `audit_log` records one row per consequential action, and bursts are
  // routine (a bulk shift handover writes one row per outstanding key). Without
  // this, publishing `audit_log` to Realtime would refetch the whole aggregate
  // once per row. Trailing edge, so a burst costs exactly one refetch.
  const invalidateEvents = useDebouncedCallback(
    () => queryClient.invalidateQueries({ queryKey: QUERY_KEY_BASE }),
    1500
  );

  useRealtime({
    table: 'audit_log',
    onInsert: invalidateEvents,
  });

  const {
    data: rawBuckets = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: [...QUERY_KEY_BASE, range.from, range.to],
    refetchInterval: connectionStatus !== 'connected' ? 10_000 : false,
    queryFn: async (): Promise<RawBucket[]> => {
      const supabase = createBrowserClient();
      const { data, error: queryError } = await supabase
        .from('audit_log')
        .select('occurred_at, event')
        .gte('occurred_at', range.from)
        .lte('occurred_at', range.to)
        .order('occurred_at', { ascending: true });

      if (queryError) throw new Error('Failed to load activity data.');

      return bucketEvents(data ?? [], range, unit);
    },
  });

  // Switching the dropdown never refetches — every category's count for
  // every bucket is already in rawBuckets, so this is a pure client-side derive.
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
  const avg = buckets.length > 0 ? Math.round(total / buckets.length) : 0;
  const peak = buckets.reduce((max, b) => (b.count > max.count ? b : max), {
    date: '',
    label: '',
    count: 0,
  });
  const filterLabel =
    selectedType === 'ALL' ? null : EVENT_TYPE_LABELS[selectedType];
  const dateRangeLabel = formatRangeLabel(range);

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
            aria-label={`Audit log activity${filterLabel ? ` for ${filterLabel}` : ''}, ${dateRangeLabel}: total ${total} events, ${UNIT_ADJECTIVE[unit]} average ${avg}, peak ${peak.count} on ${peak.label}`}
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
