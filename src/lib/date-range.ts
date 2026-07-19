import { differenceInDays, format, sub, type Duration } from 'date-fns';

export type RangePreset = '1d' | '1w' | '1m' | '1y' | 'custom';

// ISO timestamps
export type DateRange = { from: string; to: string };

export type TimeRangeValue = { preset: RangePreset; range: DateRange };

export type BucketUnit = 'hour' | 'day' | 'week';

const PRESET_DURATIONS: Record<Exclude<RangePreset, 'custom'>, Duration> = {
  '1d': { days: 1 },
  '1w': { weeks: 1 },
  '1m': { months: 1 },
  '1y': { years: 1 },
};

export const RANGE_PRESET_OPTIONS: {
  value: Exclude<RangePreset, 'custom'>;
  label: string;
}[] = [
  { value: '1d', label: '1d' },
  { value: '1w', label: '1w' },
  { value: '1m', label: '1m' },
  { value: '1y', label: '1y' },
];

export const rangeFromPreset = (
  preset: Exclude<RangePreset, 'custom'>,
  now: Date = new Date()
): DateRange => ({
  from: sub(now, PRESET_DURATIONS[preset]).toISOString(),
  to: now.toISOString(),
});

// Custom Date pair -> ISO DateRange. `to` extends to end-of-day so the
// selected end date is fully included regardless of time of day.
export const rangeFromDates = (from: Date, to: Date): DateRange => {
  const end = new Date(to);
  end.setHours(23, 59, 59, 999);
  return { from: from.toISOString(), to: end.toISOString() };
};

// "4 June 2026 - 3 July 2026" style label
export const formatRangeLabel = (range: DateRange): string =>
  `${format(new Date(range.from), 'd MMMM yyyy')} - ${format(new Date(range.to), 'd MMMM yyyy')}`;

// Bucket granularity for a chart spanning this range: hourly for very short
// ranges (a single-day preset would otherwise be 1-2 daily bars), weekly for
// long ones (a year of daily bars is unreadable), daily in between.
export const bucketUnitForRange = (range: DateRange): BucketUnit => {
  const days = differenceInDays(new Date(range.to), new Date(range.from));
  if (days <= 2) return 'hour';
  if (days <= 90) return 'day';
  return 'week';
};
