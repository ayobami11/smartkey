import { describe, expect, it } from 'vitest';

import {
  isOverdue,
  occupancyOf,
  occupiesKey,
  stateOf,
  summariseByZone,
  type KeyOccupancy,
  type KeyOccupancyRow,
} from '@/lib/keys/occupancy';

const NOW = new Date('2026-10-13T12:00:00.000Z');
const HOUR_AGO = '2026-10-13T11:00:00.000Z';
const IN_AN_HOUR = '2026-10-13T13:00:00.000Z';
const MINUTE_AGO = '2026-10-13T11:59:00.000Z';
const IN_TEN_MINUTES = '2026-10-13T12:10:00.000Z';

// The two truth tables below are mirrored, label for label, in
// supabase/tests/11_key_occupancy_test.sql against the SQL predicates
// request_occupies_key() and request_is_overdue(). Change one, change both.

describe('occupiesKey — mirrors public.request_occupies_key', () => {
  it.each([
    ['KEY_ISSUED occupies', 'KEY_ISSUED', null, true],
    [
      'KEY_ISSUED occupies even with a lapsed code expiry',
      'KEY_ISSUED',
      HOUR_AGO,
      true,
    ],
    ['live CODE_ISSUED occupies', 'CODE_ISSUED', IN_TEN_MINUTES, true],
    ['lapsed CODE_ISSUED does not occupy', 'CODE_ISSUED', MINUTE_AGO, false],
    ['CODE_ISSUED with no expiry occupies', 'CODE_ISSUED', null, true],
    ['PENDING_HOD does not occupy', 'PENDING_HOD', null, false],
    ['APPROVED does not occupy', 'APPROVED', null, false],
    ['KEY_RETURNED does not occupy', 'KEY_RETURNED', null, false],
  ] as const)('%s', (_label, status, codeExpiresAt, expected) => {
    expect(occupiesKey({ status, code_expires_at: codeExpiresAt }, NOW)).toBe(
      expected
    );
  });
});

describe('isOverdue — mirrors public.request_is_overdue', () => {
  it.each([
    ['KEY_ISSUED past its deadline is overdue', 'KEY_ISSUED', HOUR_AGO, true],
    [
      'KEY_ISSUED before its deadline is not overdue',
      'KEY_ISSUED',
      IN_AN_HOUR,
      false,
    ],
    ['KEY_ISSUED with no deadline is not overdue', 'KEY_ISSUED', null, false],
    [
      'CODE_ISSUED past its deadline is not overdue',
      'CODE_ISSUED',
      HOUR_AGO,
      false,
    ],
    [
      'KEY_RETURNED past its deadline is not overdue',
      'KEY_RETURNED',
      HOUR_AGO,
      false,
    ],
  ] as const)('%s', (_label, status, returnDeadline, expected) => {
    expect(isOverdue({ status, return_deadline: returnDeadline }, NOW)).toBe(
      expected
    );
  });

  it('treats a deadline of exactly now as not yet overdue', () => {
    expect(
      isOverdue(
        { status: 'KEY_ISSUED', return_deadline: NOW.toISOString() },
        NOW
      )
    ).toBe(false);
  });
});

type Req = {
  status: string;
  code_expires_at: string | null;
  return_deadline: string | null;
};

const held = (deadline: string | null = IN_AN_HOUR): Req => ({
  status: 'KEY_ISSUED',
  code_expires_at: null,
  return_deadline: deadline,
});

const code = (expires: string | null = IN_TEN_MINUTES): Req => ({
  status: 'CODE_ISSUED',
  code_expires_at: expires,
  return_deadline: IN_AN_HOUR,
});

describe('occupancyOf', () => {
  // Same fixture as K1 in supabase/tests/11_key_occupancy_test.sql.
  it('counts held, overdue and reserved copies and ignores non-occupying rows', () => {
    const result = occupancyOf(
      { key_count: 4, retired: false },
      [
        held(HOUR_AGO),
        held(HOUR_AGO),
        held(),
        code(),
        code(MINUTE_AGO),
        {
          status: 'APPROVED',
          code_expires_at: null,
          return_deadline: IN_AN_HOUR,
        },
        {
          status: 'KEY_RETURNED',
          code_expires_at: null,
          return_deadline: HOUR_AGO,
        },
      ],
      NOW
    );

    expect(result).toEqual({
      key_count: 4,
      retired: false,
      issued: 3,
      overdue: 2,
      reserved: 1,
      occupied: 4,
      available: 0,
    });
  });

  it('reports every copy available when nothing occupies the key', () => {
    expect(occupancyOf({ key_count: 12, retired: false }, [], NOW)).toEqual({
      key_count: 12,
      retired: false,
      issued: 0,
      overdue: 0,
      reserved: 0,
      occupied: 0,
      available: 12,
    });
  });

  it('reports nothing available on a retired key, whatever its holders', () => {
    const result = occupancyOf({ key_count: 2, retired: true }, [held()], NOW);

    expect(result.available).toBe(0);
    expect(result.issued).toBe(1);
  });

  it('never reports negative availability on an over-capacity key', () => {
    const result = occupancyOf(
      { key_count: 1, retired: false },
      [held(), held()],
      NOW
    );

    expect(result.occupied).toBe(2);
    expect(result.available).toBe(0);
  });

  it('treats a null key_count as a single copy', () => {
    const result = occupancyOf({ key_count: null, retired: false }, [], NOW);

    expect(result.key_count).toBe(1);
    expect(result.available).toBe(1);
  });
});

const occ = (overrides: Partial<KeyOccupancy> = {}): KeyOccupancy => ({
  key_count: 1,
  retired: false,
  issued: 0,
  overdue: 0,
  reserved: 0,
  occupied: 0,
  available: 1,
  ...overrides,
});

describe('stateOf', () => {
  it.each([
    [
      'RETIRED wins over everything',
      occ({ retired: true, available: 0 }),
      'RETIRED',
    ],
    ['a free copy is AVAILABLE', occ(), 'AVAILABLE'],
    [
      'a partially-out key with a late holder is still AVAILABLE',
      occ({ key_count: 3, issued: 1, overdue: 1, occupied: 1, available: 2 }),
      'AVAILABLE',
    ],
    [
      'exhausted by live codes alone is SPOKEN_FOR',
      occ({ reserved: 1, occupied: 1, available: 0 }),
      'SPOKEN_FOR',
    ],
    [
      'exhausted with a late holder is OVERDUE',
      occ({ issued: 1, overdue: 1, occupied: 1, available: 0 }),
      'OVERDUE',
    ],
    [
      'exhausted with on-time holders is OUT',
      occ({
        key_count: 2,
        issued: 1,
        reserved: 1,
        occupied: 2,
        available: 0,
      }),
      'OUT',
    ],
  ] as const)('%s', (_label, occupancy, expected) => {
    expect(stateOf(occupancy)).toBe(expected);
  });
});

const row = (overrides: Partial<KeyOccupancyRow> = {}): KeyOccupancyRow => ({
  key_id: 'key',
  zone: 'NEW_SENATE',
  unit_id: 'unit',
  ...occ(),
  ...overrides,
});

describe('summariseByZone', () => {
  it('always returns both zones, in a fixed order, even with no rows', () => {
    expect(summariseByZone([])).toEqual([
      {
        zone: 'NEW_SENATE',
        name: 'New Senate',
        total: 0,
        issued: 0,
        overdue: 0,
        reserved: 0,
        available: 0,
      },
      {
        zone: 'OLD_SENATE',
        name: 'Old Senate',
        total: 0,
        issued: 0,
        overdue: 0,
        reserved: 0,
        available: 0,
      },
    ]);
  });

  it('counts copies, splits overdue out of issued, and skips retired keys', () => {
    const [newSenate, oldSenate] = summariseByZone([
      // twelve-copy room, three out (one late), one reserved
      row({
        key_count: 12,
        issued: 3,
        overdue: 1,
        reserved: 1,
        occupied: 4,
        available: 8,
      }),
      // single-copy room, free
      row(),
      // retired: contributes nothing
      row({
        retired: true,
        key_count: 5,
        issued: 1,
        occupied: 1,
        available: 0,
      }),
      // other zone
      row({
        zone: 'OLD_SENATE',
        key_count: 2,
        issued: 2,
        occupied: 2,
        available: 0,
      }),
    ]);

    expect(newSenate).toEqual({
      zone: 'NEW_SENATE',
      name: 'New Senate',
      total: 13,
      issued: 2,
      overdue: 1,
      reserved: 1,
      available: 9,
    });
    expect(
      newSenate.issued +
        newSenate.overdue +
        newSenate.reserved +
        newSenate.available
    ).toBe(newSenate.total);

    expect(oldSenate).toMatchObject({
      zone: 'OLD_SENATE',
      total: 2,
      issued: 2,
      available: 0,
    });
  });
});
