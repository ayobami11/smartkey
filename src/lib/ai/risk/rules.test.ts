import { describe, expect, it } from 'vitest';

import {
  collectorNotWhitelisted,
  excessRequestFrequency,
  outstandingKeyNotReturned,
  outsideOperationalHours,
  weekendWithoutMemo,
} from './rules';
import type { RiskContext } from './types';

const base: RiskContext = {
  requestType: 'WEEKDAY',
  requestedAt: new Date('2026-06-09T10:00:00'), // Monday 10:00
  keyZone: 'NEW_SENATE',
  hasOutstandingKey: false,
  recentRequestCount: 0,
  isWhitelisted: true,
};

describe('outsideOperationalHours', () => {
  const opts = { start: '07:00', end: '18:00', weight: 3 };

  it('does not fire during operational hours on a weekday', () => {
    expect(outsideOperationalHours(base, opts)).toBeNull();
  });

  it('fires before operational hours', () => {
    const ctx = { ...base, requestedAt: new Date('2026-06-09T06:30:00') };
    const result = outsideOperationalHours(ctx, opts);
    expect(result).not.toBeNull();
    expect(result!.rule).toBe('outside_operational_hours');
    expect(result!.weight).toBe(3);
  });

  it('fires after operational hours', () => {
    const ctx = { ...base, requestedAt: new Date('2026-06-09T19:00:00') };
    expect(outsideOperationalHours(ctx, opts)).not.toBeNull();
  });

  it('fires on Saturday', () => {
    const ctx = { ...base, requestedAt: new Date('2026-06-13T10:00:00') }; // Saturday
    expect(outsideOperationalHours(ctx, opts)).not.toBeNull();
  });

  it('fires on Sunday', () => {
    const ctx = { ...base, requestedAt: new Date('2026-06-14T10:00:00') }; // Sunday
    expect(outsideOperationalHours(ctx, opts)).not.toBeNull();
  });

  it('fires exactly at end boundary (exclusive)', () => {
    const ctx = { ...base, requestedAt: new Date('2026-06-09T18:00:00') };
    expect(outsideOperationalHours(ctx, opts)).not.toBeNull();
  });

  it('does not fire exactly at start boundary (inclusive)', () => {
    const ctx = { ...base, requestedAt: new Date('2026-06-09T07:00:00') };
    expect(outsideOperationalHours(ctx, opts)).toBeNull();
  });
});

describe('outstandingKeyNotReturned', () => {
  it('does not fire when no outstanding key', () => {
    expect(outstandingKeyNotReturned(base)).toBeNull();
  });

  it('fires when requester has an outstanding key', () => {
    const ctx = { ...base, hasOutstandingKey: true };
    const result = outstandingKeyNotReturned(ctx);
    expect(result).not.toBeNull();
    expect(result!.rule).toBe('outstanding_key_not_returned');
    expect(result!.weight).toBe(5);
  });

  it('respects custom weight', () => {
    const ctx = { ...base, hasOutstandingKey: true };
    expect(outstandingKeyNotReturned(ctx, { weight: 10 })!.weight).toBe(10);
  });
});

describe('weekendWithoutMemo', () => {
  it('does not fire for WEEKDAY requests', () => {
    expect(weekendWithoutMemo(base)).toBeNull();
  });

  it('fires for WEEKEND requests', () => {
    const ctx = { ...base, requestType: 'WEEKEND' as const };
    const result = weekendWithoutMemo(ctx);
    expect(result).not.toBeNull();
    expect(result!.rule).toBe('weekend_without_memo');
    expect(result!.weight).toBe(4);
  });
});

describe('excessRequestFrequency', () => {
  it('does not fire at or below threshold', () => {
    const ctx = { ...base, recentRequestCount: 5 };
    expect(excessRequestFrequency(ctx, { maxDailyRequests: 5 })).toBeNull();
  });

  it('fires when count exceeds threshold', () => {
    const ctx = { ...base, recentRequestCount: 6 };
    const result = excessRequestFrequency(ctx, { maxDailyRequests: 5 });
    expect(result).not.toBeNull();
    expect(result!.rule).toBe('excess_request_frequency');
    expect(result!.weight).toBe(2);
  });

  it('does not fire at zero requests', () => {
    expect(excessRequestFrequency(base, { maxDailyRequests: 5 })).toBeNull();
  });
});

describe('collectorNotWhitelisted', () => {
  it('does not fire when whitelisted', () => {
    expect(collectorNotWhitelisted(base)).toBeNull();
  });

  it('fires when not whitelisted', () => {
    const ctx = { ...base, isWhitelisted: false };
    const result = collectorNotWhitelisted(ctx);
    expect(result).not.toBeNull();
    expect(result!.rule).toBe('collector_not_whitelisted');
    expect(result!.weight).toBe(5);
  });
});
