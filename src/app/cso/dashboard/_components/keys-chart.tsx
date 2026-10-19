'use client';

import { format } from 'date-fns';
import { Cell, Label, Pie, PieChart } from 'recharts';

import { Button } from '@/components/ui/button';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { KEY_AVAILABILITY_CONFIG } from '@/components/smartkey/key-availability-status';
import { useLiveQuery } from '@/hooks/use-live-query';
import {
  summariseByZone,
  type KeyOccupancyRow,
  type ZoneOccupancy,
} from '@/lib/keys/occupancy';
import { createBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

// "Friday, 3 July 2026" — full weekday + full month, comma after weekday.
const formatFullDate = (date: Date): string =>
  format(date, 'EEEE, d MMMM yyyy');

const QUERY_KEY = ['cso', 'key-occupancy'] as const;

type SliceKey = 'issued' | 'reserved' | 'overdue' | 'available';

// One entry per slice, in legend order. Colours are theme tokens (SVG `fill`
// needs a real colour value, so the CSS variable is passed through rather than
// a Tailwind class); icons come from the requester availability config so the
// same state reads the same everywhere. Every slice carries icon + text in the
// legend — colour is never the only signal.
const SLICES: readonly {
  key: SliceKey;
  label: string;
  fill: string;
  dot: string;
  Icon: React.ElementType;
}[] = [
  {
    key: 'issued',
    label: 'Issued',
    fill: 'var(--muted-foreground)',
    dot: 'text-muted-foreground',
    Icon: KEY_AVAILABILITY_CONFIG.OUT.Icon,
  },
  {
    key: 'reserved',
    label: KEY_AVAILABILITY_CONFIG.SPOKEN_FOR.label,
    fill: 'var(--warning)',
    dot: 'text-warning',
    Icon: KEY_AVAILABILITY_CONFIG.SPOKEN_FOR.Icon,
  },
  {
    key: 'overdue',
    label: KEY_AVAILABILITY_CONFIG.OVERDUE.label,
    fill: 'var(--destructive)',
    dot: 'text-destructive',
    Icon: KEY_AVAILABILITY_CONFIG.OVERDUE.Icon,
  },
  {
    key: 'available',
    label: KEY_AVAILABILITY_CONFIG.AVAILABLE.label,
    fill: 'var(--success)',
    dot: 'text-success',
    Icon: KEY_AVAILABILITY_CONFIG.AVAILABLE.Icon,
  },
];

const zoneChartConfig: ChartConfig = Object.fromEntries(
  SLICES.map((slice) => [slice.key, { label: slice.label }])
);

const describeZone = (zone: ZoneOccupancy): string =>
  `${zone.name}: ${SLICES.map(
    (slice) => `${zone[slice.key]} ${slice.label.toLowerCase()}`
  ).join(', ')}, of ${zone.total} keys`;

export const KeysChart = () => {
  // Counts copies, not key records: a room with twelve copies contributes
  // twelve, and a copy reserved by a live collection code is "being
  // collected", not available. The rule lives in get_key_occupancy().
  const {
    data: zones = [],
    isLoading,
    error,
    refetch,
  } = useLiveQuery({
    queryKey: QUERY_KEY,
    // Overdue is derived from the clock, so nothing in the database changes
    // at the moment a deadline passes. The poll picks that up.
    poll: 60_000,
    queryFn: async (): Promise<ZoneOccupancy[]> => {
      const supabase = createBrowserClient();
      const { data, error: rpcError } = await supabase.rpc('get_key_occupancy');
      if (rpcError) throw new Error('Failed to load key counts.');
      return summariseByZone((data ?? []) as KeyOccupancyRow[]);
    },
    // Any request or key change can move a copy between slices; re-read.
    subscriptions: [{ table: 'requests' }, { table: 'keys' }],
  });

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-foreground">Keys</h2>

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2" aria-busy="true">
          <Skeleton className="h-36 rounded-lg" />
          <Skeleton className="h-36 rounded-lg" />
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
        <div className="grid gap-4 sm:grid-cols-2">
          {zones.map((zone) => {
            const pieData = SLICES.map((slice) => ({
              name: slice.label,
              value: zone[slice.key],
              fill: slice.fill,
            }));
            return (
              <div
                key={zone.zone}
                className="rounded-lg border border-border bg-card p-6 shadow-[0_2px_4px_rgba(15,23,42,0.06)]"
              >
                <div>
                  <p className="text-base font-semibold text-foreground">
                    {zone.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatFullDate(new Date())}
                  </p>
                </div>

                <div className="mt-4 flex items-center gap-4">
                  <div
                    role="img"
                    aria-label={describeZone(zone)}
                    className="shrink-0"
                  >
                    <ChartContainer
                      config={zoneChartConfig}
                      className="aspect-square! h-32 w-32"
                    >
                      <PieChart>
                        <ChartTooltip
                          content={
                            <ChartTooltipContent indicator="dot" hideLabel />
                          }
                        />
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={36}
                          outerRadius={52}
                          strokeWidth={2}
                        >
                          {pieData.map((entry) => (
                            <Cell key={entry.name} fill={entry.fill} />
                          ))}
                          <Label
                            content={({ viewBox }) => {
                              if (
                                !viewBox ||
                                !('cx' in viewBox) ||
                                !('cy' in viewBox)
                              )
                                return null;
                              return (
                                <text
                                  x={viewBox.cx}
                                  y={viewBox.cy}
                                  textAnchor="middle"
                                  dominantBaseline="middle"
                                >
                                  <tspan
                                    x={viewBox.cx}
                                    y={viewBox.cy - 8}
                                    className="fill-foreground text-xl font-semibold"
                                  >
                                    {zone.total}
                                  </tspan>
                                  <tspan
                                    x={viewBox.cx}
                                    y={viewBox.cy + 10}
                                    className="fill-muted-foreground text-xs"
                                  >
                                    keys
                                  </tspan>
                                </text>
                              );
                            }}
                          />
                        </Pie>
                      </PieChart>
                    </ChartContainer>
                  </div>
                  <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                    {SLICES.map(({ key, label, dot, Icon }) => (
                      <li key={key} className="flex items-center gap-1.5">
                        <Icon
                          className={cn('size-3.5 shrink-0', dot)}
                          aria-hidden="true"
                        />
                        {label} {zone[key]}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
