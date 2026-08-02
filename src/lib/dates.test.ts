import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  formatDeadline,
  formatLastSignIn,
  isPastDate,
  isTodayDate,
  relativeTime,
  relativeTimeCompact,
} from '@/lib/dates';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-08T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('formatDeadline', () => {
  it('shows "Today HH:mm" when the date is today', () => {
    expect(formatDeadline('2026-06-08T17:00:00.000Z')).toMatch(
      /^Today \d{2}:\d{2}$/
    );
  });

  it('shows the weekday/date form when the date is not today', () => {
    expect(formatDeadline('2026-06-05T17:00:00.000Z')).not.toMatch(/^Today/);
    expect(formatDeadline('2026-06-05T17:00:00.000Z')).toMatch(
      /^\w{3} \d{1,2} \w{3} \d{2}:\d{2}$/
    );
  });
});

describe('relativeTime', () => {
  it('shows "just now" for under a minute ago', () => {
    expect(relativeTime('2026-06-08T11:59:30.000Z')).toBe('just now');
  });

  it('pluralises minutes correctly (singular vs plural)', () => {
    expect(relativeTime('2026-06-08T11:59:00.000Z')).toBe('1 min ago');
    expect(relativeTime('2026-06-08T11:55:00.000Z')).toBe('5 mins ago');
  });

  it('pluralises hours correctly (singular vs plural)', () => {
    expect(relativeTime('2026-06-08T11:00:00.000Z')).toBe('1 hr ago');
    expect(relativeTime('2026-06-08T09:00:00.000Z')).toBe('3 hrs ago');
  });

  it('pluralises days correctly (singular vs plural)', () => {
    expect(relativeTime('2026-06-07T12:00:00.000Z')).toBe('1 day ago');
    expect(relativeTime('2026-06-05T12:00:00.000Z')).toBe('3 days ago');
  });
});

describe('relativeTimeCompact', () => {
  it('shows "just now" for under a minute ago', () => {
    expect(relativeTimeCompact('2026-06-08T11:59:30.000Z')).toBe('just now');
  });

  it('uses compact suffixes with no singular/plural distinction', () => {
    expect(relativeTimeCompact('2026-06-08T11:59:00.000Z')).toBe('1m ago');
    expect(relativeTimeCompact('2026-06-08T11:00:00.000Z')).toBe('1h ago');
    expect(relativeTimeCompact('2026-06-07T12:00:00.000Z')).toBe('1d ago');
  });
});

describe('formatLastSignIn', () => {
  it('shows "Never" for null', () => {
    expect(formatLastSignIn(null)).toBe('Never');
  });

  it('shows "Just now" for under a minute ago', () => {
    expect(formatLastSignIn('2026-06-08T11:59:30.000Z')).toBe('Just now');
  });

  it('shows compact minutes/hours for under a day', () => {
    expect(formatLastSignIn('2026-06-08T11:55:00.000Z')).toBe('5m ago');
    expect(formatLastSignIn('2026-06-08T09:00:00.000Z')).toBe('3h ago');
  });

  it('shows compact days for 1-6 days ago', () => {
    expect(formatLastSignIn('2026-06-05T12:00:00.000Z')).toBe('3d ago');
  });

  it('falls back to an absolute date at the 7-day cutoff', () => {
    // Exactly 7 days ago: the boundary itself falls through to the
    // absolute-date branch (days < 7 is false at days === 7).
    expect(formatLastSignIn('2026-06-01T12:00:00.000Z')).toBe('1 Jun 2026');
  });

  it('falls back to an absolute date well beyond 7 days', () => {
    expect(formatLastSignIn('2026-05-01T12:00:00.000Z')).toBe('1 May 2026');
  });
});

describe('isTodayDate', () => {
  it('returns true for today', () => {
    expect(isTodayDate('2026-06-08')).toBe(true);
  });

  it('returns false for any other day', () => {
    expect(isTodayDate('2026-06-07')).toBe(false);
    expect(isTodayDate('2026-06-09')).toBe(false);
  });
});

describe('isPastDate', () => {
  it('returns false for today', () => {
    expect(isPastDate('2026-06-08')).toBe(false);
  });

  it('returns true for a date before today', () => {
    expect(isPastDate('2026-06-07')).toBe(true);
  });

  it('returns false for a date after today', () => {
    expect(isPastDate('2026-06-09')).toBe(false);
  });
});
