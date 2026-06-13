'use client';

import { useEffect, useState } from 'react';

import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { createBrowserClient } from '@/lib/supabase/client';
import { useRealtime } from '@/hooks/useRealtime';

// Types

type ZoneStat = {
  name: string;
  zone: string;
  issued: number;
  total: number;
  trend: number;
};

// Component

export const LiveZoneCounts = () => {
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
        trend: 0,
      },
      OLD_SENATE: {
        name: 'Old Senate',
        zone: 'OLD_SENATE',
        issued: 0,
        total: 0,
        trend: 0,
      },
    };
    (data ?? []).forEach((k) => {
      if (k.zone in zoneMap) {
        zoneMap[k.zone].total++;
        if (k.status === 'ISSUED' || k.status === 'OVERDUE')
          zoneMap[k.zone].issued++;
      }
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
      <h2 className="text-sm font-semibold text-foreground">
        Live zone counts
      </h2>
      {zonesLoading ? (
        <>
          <Skeleton className="h-36 rounded-lg" />
          <Skeleton className="h-36 rounded-lg" />
        </>
      ) : (
        zones.map((zone) => {
          const up = zone.trend > 0;
          const ArrowIcon = up ? ArrowUpIcon : ArrowDownIcon;
          const trendClass = up ? 'text-destructive' : 'text-emerald-600';
          return (
            <div
              key={zone.zone}
              className="rounded-lg border border-border bg-card p-6 shadow-[0_2px_4px_rgba(15,23,42,0.06)]"
            >
              <p className="text-sm font-medium text-muted-foreground">
                {zone.name}
              </p>
              <p className="mt-2 text-5xl font-semibold tabular-nums text-foreground">
                {zone.issued}
                <span className="ml-1.5 text-2xl font-normal text-muted-foreground">
                  / {zone.total}
                </span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                keys checked out
              </p>
              <div
                className={`mt-4 flex items-center gap-1 text-xs font-medium ${trendClass}`}
                aria-label={`${Math.abs(zone.trend)} ${up ? 'more' : 'fewer'} than same time yesterday`}
              >
                <ArrowIcon className="size-3.5 shrink-0" aria-hidden="true" />
                <span>
                  {up ? '+' : ''}
                  {zone.trend} vs same time yesterday
                </span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};
