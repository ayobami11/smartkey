// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { csvEnum, pageLimit, timestamp } from '@/lib/http/query';

describe('pageLimit', () => {
  const limit = pageLimit(20, 50);

  it('defaults when absent', () => {
    expect(limit.parse(undefined)).toBe(20);
  });

  it('parses and clamps', () => {
    expect(limit.parse('7')).toBe(7);
    expect(limit.parse('500')).toBe(50);
  });

  it.each(['abc', '', '0', '-1', '1.5', '2e3'])('refuses %j', (value) => {
    expect(limit.safeParse(value).success).toBe(false);
  });
});

describe('timestamp', () => {
  it.each([
    '2026-10-13',
    '2026-10-13T09:00:00Z',
    '2026-10-13T09:00:00.123Z',
    '2026-10-13T09:00:00.123456+00:00',
    '2026-10-13 09:00:00+01',
  ])('accepts %j', (value) => {
    expect(timestamp.safeParse(value).success).toBe(true);
  });

  it.each([
    '1',
    'yesterday',
    '2026-13-45',
    '2026-02-30',
    '2026-04-31T00:00:00Z',
    '2026-10-13T25:00:00Z',
    '',
  ])('refuses %j', (value) => {
    expect(timestamp.safeParse(value).success).toBe(false);
  });
});

describe('csvEnum', () => {
  const statuses = csvEnum(['A', 'B', 'C']);

  it('splits a comma list', () => {
    expect(statuses.parse('A,C')).toEqual(['A', 'C']);
  });

  it.each(['A,X', '', 'A,', 'a'])('refuses %j', (value) => {
    expect(statuses.safeParse(value).success).toBe(false);
  });
});
