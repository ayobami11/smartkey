import { describe, expect, it } from 'vitest';

import { todayDateISOTz } from '@/lib/dates';
import { weekendDateProblem } from '@/lib/validation/weekend-date';

// Tuesday 13 October 2026, mid-morning in Lagos.
const TUESDAY = new Date('2026-10-13T10:00:00Z');

describe('weekendDateProblem', () => {
  it.each([
    ['the coming Saturday', '2026-10-17'],
    ['the coming Sunday', '2026-10-18'],
    ['a weekend months away', '2027-01-02'],
  ])('accepts %s', (_label, date) => {
    expect(weekendDateProblem(date, TUESDAY)).toBeNull();
  });

  it('accepts today when today is a weekend day', () => {
    const saturday = new Date('2026-10-17T09:00:00Z');
    expect(weekendDateProblem('2026-10-17', saturday)).toBeNull();
  });

  it.each([
    ['a weekday', '2026-10-14'],
    ['a malformed date', '2026-1-17'],
    ['an impossible date', '2026-02-30'],
    ['not a date', 'saturday'],
  ])('rejects %s as NOT_WEEKEND', (_label, date) => {
    expect(weekendDateProblem(date, TUESDAY)).toBe('NOT_WEEKEND');
  });

  it.each([
    ['last Sunday', '2026-10-11'],
    ['last Saturday', '2026-10-10'],
    ['a weekend last year', '2025-10-18'],
  ])('rejects %s as PAST', (_label, date) => {
    expect(weekendDateProblem(date, TUESDAY)).toBe('PAST');
  });

  it('uses Lagos time: 00:30 WAT Sunday is already Sunday', () => {
    // 23:30 UTC Saturday is 00:30 WAT Sunday, so Saturday has passed in Lagos
    // even though it is still Saturday on the server's UTC clock.
    const lateSaturdayUtc = new Date('2026-10-17T23:30:00Z');
    expect(todayDateISOTz(lateSaturdayUtc)).toBe('2026-10-18');
    expect(weekendDateProblem('2026-10-17', lateSaturdayUtc)).toBe('PAST');
    expect(weekendDateProblem('2026-10-18', lateSaturdayUtc)).toBeNull();
  });
});
