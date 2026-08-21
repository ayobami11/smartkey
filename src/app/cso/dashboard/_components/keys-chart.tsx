'use client';

import { useEffect, useState } from 'react';

import { format } from 'date-fns';
import { Cell, Label, Pie, PieChart } from 'recharts';

import { Skeleton } from '@/components/ui/skeleton';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { createBrowserClient } from '@/lib/supabase/client';
import { useRealtime } from '@/hooks/use-realtime';

// "Friday, 3 July 2026" — full weekday + full month, comma after weekday.
const formatFullDate = (date: Date): string =>
  format(date, 'EEEE, d MMMM yyyy');

type ZoneStat = {
  name: string;
  zone: string;
  issued: number;
  total: number;
  issuedOnly: number;
  overdue: number;
  available: number;
};

// SVG fill needs a real colour value, not a Tailwind class — recharts renders
// these as literal `fill` attributes on the underlying <rect>. These are the
// same hex values Tailwind's slate-500/emerald-500 resolve to; --destructive
// is the one real CSS var this codebase already has for a status colour.
const ZONE_COLORS = {
  issuedOnly: '#64748b',
  available: '#10b981',
  overdue: 'var(--destructive)',
} as const;

const zoneChartConfig: ChartConfig = {
  issuedOnly: { label: 'Issued' },
  available: { label: 'Available' },
  overdue: { label: 'Overdue' },
};

export const KeysChart = () => {
  const [zones, setZones] = useState<ZoneStat[]>([]);
  const [zonesLoading, setZonesLoading] = useState(true);

  const fetchZones = async () => {
    const supabase = createBrowserClient();
    const { data } = await supabase
      .from('keys')
      .select('zone, status')
      .neq('status', 'RETIRED');

    const zoneMap: Record<string, ZoneStat> = {
      NEW_SENATE: {
        name: 'New Senate',
        zone: 'NEW_SENATE',
        issued: 0,
        total: 0,
        issuedOnly: 0,
        overdue: 0,
        available: 0,
      },
      OLD_SENATE: {
        name: 'Old Senate',
        zone: 'OLD_SENATE',
        issued: 0,
        total: 0,
        issuedOnly: 0,
        overdue: 0,
        available: 0,
      },
    };
    (data ?? []).forEach((k) => {
      if (k.zone in zoneMap) {
        zoneMap[k.zone].total++;
        if (k.status === 'ISSUED' || k.status === 'OVERDUE')
          zoneMap[k.zone].issued++;
        if (k.status === 'ISSUED') zoneMap[k.zone].issuedOnly++;
        if (k.status === 'OVERDUE') zoneMap[k.zone].overdue++;
      }
    });
    Object.values(zoneMap).forEach((z) => {
      z.available = z.total - z.issuedOnly - z.overdue;
    });
    setZones(Object.values(zoneMap));
    setZonesLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchZones();
  }, []);

  // Live "building pulse": keys.status drives the counts (ISSUED on issue,
  // AVAILABLE on return, OVERDUE from the hourly job). Re-read on any key change.
  useRealtime({
    table: 'keys',
    onInsert: () => fetchZones(),
    onUpdate: () => fetchZones(),
    onDelete: () => fetchZones(),
  });

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-foreground">Keys</h2>
      {zonesLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-36 rounded-lg" />
          <Skeleton className="h-36 rounded-lg" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {zones.map((zone) => {
            const pieData = [
              {
                name: 'Issued',
                value: zone.issuedOnly,
                fill: ZONE_COLORS.issuedOnly,
              },
              {
                name: 'Available',
                value: zone.available,
                fill: ZONE_COLORS.available,
              },
              {
                name: 'Overdue',
                value: zone.overdue,
                fill: ZONE_COLORS.overdue,
              },
            ];
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
                    aria-label={`${zone.name}: ${zone.issuedOnly} issued, ${zone.available} available, ${zone.overdue} overdue, of ${zone.total} keys`}
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
                  <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="size-2 rounded-full bg-slate-500"
                        aria-hidden="true"
                      />
                      Issued {zone.issuedOnly}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="size-2 rounded-full bg-emerald-500"
                        aria-hidden="true"
                      />
                      Available {zone.available}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="size-2 rounded-full bg-destructive"
                        aria-hidden="true"
                      />
                      Overdue {zone.overdue}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
