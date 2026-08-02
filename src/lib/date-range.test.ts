import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  bucketUnitForRange,
  rangeFromDates,
  rangeFromPreset,
  type DateRange,
} from '@/lib/date-range';

describe('rangeFromPreset', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-08T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(['1d', '1w', '1m'] as const)(
    'computes a %s range ending now',
    (preset) => {
      const { from, to } = rangeFromPreset(preset);
      expect(to).toBe('2026-06-08T12:00:00.000Z');
      expect(new Date(to).getTime()).toBeGreaterThan(new Date(from).getTime());
    }
  );

  it('1d preset spans exactly 24 hours', () => {
    const { from, to } = rangeFromPreset('1d');
    const spanMs = new Date(to).getTime() - new Date(from).getTime();
    expect(spanMs).toBe(24 * 60 * 60 * 1000);
  });

  it('1y preset spans exactly one calendar year back', () => {
    const { from } = rangeFromPreset('1y');
    expect(from).toBe('2025-06-08T12:00:00.000Z');
  });
});

describe('rangeFromDates', () => {
  it('extends the `to` date to the end of that day (23:59:59.999)', () => {
    const from = new Date('2026-06-01T09:00:00.000Z');
    const to = new Date('2026-06-07T09:00:00.000Z');
    const range = rangeFromDates(from, to);

    expect(range.from).toBe(from.toISOString());
    const toDate = new Date(range.to);
    expect(toDate.getHours()).toBe(23);
    expect(toDate.getMinutes()).toBe(59);
    expect(toDate.getSeconds()).toBe(59);
    expect(toDate.getMilliseconds()).toBe(999);
    // Still the same calendar day as the input `to` date, just later.
    expect(toDate.getDate()).toBe(to.getDate());
  });

  it('does not mutate the `to` argument passed in', () => {
    const to = new Date('2026-06-07T09:00:00.000Z');
    const originalTime = to.getTime();
    rangeFromDates(new Date('2026-06-01T00:00:00.000Z'), to);
    expect(to.getTime()).toBe(originalTime);
  });
});

describe('bucketUnitForRange', () => {
  const range = (fromISO: string, toISO: string): DateRange => ({
    from: fromISO,
    to: toISO,
  });

  it('returns "hour" for a range of exactly 2 days', () => {
    expect(
      bucketUnitForRange(
        range('2026-06-01T00:00:00.000Z', '2026-06-03T00:00:00.000Z')
      )
    ).toBe('hour');
  });

  it('returns "day" for a range just over 2 days (the hour/day boundary)', () => {
    expect(
      bucketUnitForRange(
        range('2026-06-01T00:00:00.000Z', '2026-06-04T00:00:00.001Z')
      )
    ).toBe('day');
  });

  it('returns "day" for a range of exactly 90 days', () => {
    expect(
      bucketUnitForRange(
        range('2026-01-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z')
      )
    ).toBe('day');
  });

  it('returns "week" for a range just over 90 days (the day/week boundary)', () => {
    expect(
      bucketUnitForRange(
        range('2026-01-01T00:00:00.000Z', '2026-04-02T00:00:00.001Z')
      )
    ).toBe('week');
  });

  it('returns "week" for a range spanning a full year', () => {
    expect(
      bucketUnitForRange(
        range('2025-06-08T00:00:00.000Z', '2026-06-08T00:00:00.000Z')
      )
    ).toBe('week');
  });
});
