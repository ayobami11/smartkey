import { describe, expect, it } from 'vitest';

import { evaluateRisk } from './engine';
import type { RiskContext } from './types';

// Default tier config: MEDIUM ≥ 4, HIGH ≥ 7 (matches getTierConfig defaults)

const safeCtx: RiskContext = {
  requestType: 'WEEKDAY',
  requestedAt: new Date('2026-06-09T10:00:00'), // Monday 10:00 — in hours
  keyZone: 'NEW_SENATE',
  hasOutstandingKey: false,
  recentRequestCount: 0,
  isWhitelisted: true,
};

describe('evaluateRisk — tier boundaries', () => {
  it('returns LOW when no rules fire (weight 0)', () => {
    const result = evaluateRisk(safeCtx);
    expect(result.tier).toBe('LOW');
    expect(result.factors).toHaveLength(0);
    expect(result.totalWeight).toBe(0);
  });

  it('returns LOW just below MEDIUM boundary (weight 3)', () => {
    // only outside_operational_hours fires (weight 3) — just under MEDIUM min of 4
    const ctx: RiskContext = {
      ...safeCtx,
      requestedAt: new Date('2026-06-09T06:00:00'), // before 07:00
    };
    const result = evaluateRisk(ctx);
    expect(result.tier).toBe('LOW');
    expect(result.totalWeight).toBe(3);
  });

  it('returns MEDIUM at MEDIUM boundary (weight 4)', () => {
    // weekend_without_memo fires (weight 4)
    const ctx: RiskContext = { ...safeCtx, requestType: 'WEEKEND' };
    const result = evaluateRisk(ctx);
    expect(result.tier).toBe('MEDIUM');
    expect(result.totalWeight).toBe(4);
  });

  it('returns MEDIUM below HIGH boundary (weight 6)', () => {
    // weekend_without_memo (4) + outside_operational_hours (3) would be 7 → HIGH
    // use excess_request_frequency (2) instead: 4 + 2 = 6 → MEDIUM
    const ctx: RiskContext = {
      ...safeCtx,
      requestType: 'WEEKEND',
      recentRequestCount: 6, // above default threshold of 5
    };
    const result = evaluateRisk(ctx);
    expect(result.tier).toBe('MEDIUM');
    expect(result.totalWeight).toBe(6);
  });

  it('returns HIGH at HIGH boundary (weight 7)', () => {
    // outstanding_key_not_returned (5) + excess_request_frequency (2) = 7 → HIGH
    const ctx: RiskContext = {
      ...safeCtx,
      hasOutstandingKey: true,
      recentRequestCount: 6,
    };
    const result = evaluateRisk(ctx);
    expect(result.tier).toBe('HIGH');
    expect(result.totalWeight).toBe(7);
  });

  it('returns HIGH when all 5 rules fire', () => {
    const ctx: RiskContext = {
      requestType: 'WEEKEND',
      requestedAt: new Date('2026-06-13T06:00:00'), // Saturday before hours
      keyZone: 'NEW_SENATE',
      hasOutstandingKey: true,
      recentRequestCount: 6,
      isWhitelisted: false,
    };
    const result = evaluateRisk(ctx);
    expect(result.tier).toBe('HIGH');
    // outside(3) + outstanding(5) + weekend(4) + frequency(2) + whitelist(5) = 19
    expect(result.totalWeight).toBe(19);
    expect(result.factors).toHaveLength(5);
  });

  it('factors list contains the firing rule names', () => {
    const ctx: RiskContext = { ...safeCtx, hasOutstandingKey: true };
    const result = evaluateRisk(ctx);
    expect(result.factors.map((f) => f.rule)).toContain(
      'outstanding_key_not_returned'
    );
  });
});
