'use client';

import { useState } from 'react';

import { rangeFromPreset, type TimeRangeValue } from '@/lib/date-range';

import { TimeRangeFilter } from '@/components/smartkey/time-range-filter';

import { EventsChart } from '@/app/cso/dashboard/_components/events-chart';
import { IncidentsChart } from '@/app/cso/dashboard/_components/incidents-chart';

export const ActivitySection = () => {
  const [value, setValue] = useState<TimeRangeValue>({
    preset: '1w',
    range: rangeFromPreset('1w'),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Trends</h2>
        <TimeRangeFilter
          value={value}
          onChange={(next) => {
            // allowAllTime isn't set here, so `next` is always a bounded
            // TimeRangeValue — this guard just keeps that guarantee typed.
            if (next.preset !== 'all') setValue(next);
          }}
        />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <IncidentsChart range={value.range} />
        <EventsChart range={value.range} />
      </div>
    </div>
  );
};
