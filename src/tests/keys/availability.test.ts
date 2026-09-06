import { describe, expect, it } from 'vitest';

import {
  deriveKeyAvailability,
  deriveKeyAvailabilityList,
  type ActiveRequestRow,
  type KeyRow,
} from '@/lib/keys/availability';

const KEY: KeyRow = { id: 'key-1', status: 'AVAILABLE', key_count: 1 };
const NOW = new Date('2026-09-04T12:00:00.000Z');

const row = (overrides: Partial<ActiveRequestRow> = {}): ActiveRequestRow => ({
  key_id: 'key-1',
  status: 'KEY_ISSUED',
  created_at: '2026-09-04T09:00:00.000Z',
  issued_at: '2026-09-04T09:05:00.000Z',
  return_deadline: '2026-09-04T17:00:00.000Z',
  code_expires_at: null,
  requester: { full_name: 'Dr. Bakare' },
  guest: null,
  ...overrides,
});

describe('deriveKeyAvailability', () => {
  it('reports AVAILABLE when no active request exists', () => {
    const result = deriveKeyAvailability(KEY, [], NOW);

    expect(result).toEqual({
      key_id: 'key-1',
      state: 'AVAILABLE',
      key_count: 1,
      available_count: 1,
      return_deadline: null,
      issued_at: null,
      holder: null,
      holders: [],
    });
  });

  it('reports RETIRED regardless of any active request', () => {
    const result = deriveKeyAvailability(
      { id: 'key-1', status: 'RETIRED', key_count: 1 },
      [row()],
      NOW
    );

    expect(result.state).toBe('RETIRED');
    expect(result.available_count).toBe(0);
    expect(result.holder).toBeNull();
  });

  it('reports OUT with the holder while the deadline is in the future', () => {
    const result = deriveKeyAvailability(KEY, [row()], NOW);

    expect(result.state).toBe('OUT');
    expect(result.available_count).toBe(0);
    expect(result.holder).toEqual({
      full_name: 'Dr. Bakare',
      is_guest: false,
    });
    expect(result.holders).toEqual([{ full_name: 'Dr. Bakare', is_guest: false }]);
    expect(result.issued_at).toBe('2026-09-04T09:05:00.000Z');
    expect(result.return_deadline).toBe('2026-09-04T17:00:00.000Z');
  });

  it('reports OVERDUE once the deadline has passed', () => {
    const result = deriveKeyAvailability(
      KEY,
      [row({ return_deadline: '2026-09-04T11:00:00.000Z' })],
      NOW
    );

    expect(result.state).toBe('OVERDUE');
    expect(result.holder?.full_name).toBe('Dr. Bakare');
  });

  it('treats a KEY_ISSUED row with no deadline as OUT, not OVERDUE', () => {
    const result = deriveKeyAvailability(
      KEY,
      [row({ return_deadline: null })],
      NOW
    );

    expect(result.state).toBe('OUT');
  });

  // A code minted but not yet collected. Naming a person whose code may simply
  // expire in ten minutes is disclosure without purpose.
  it('reports SPOKEN_FOR with no holder for a live CODE_ISSUED row', () => {
    const result = deriveKeyAvailability(
      KEY,
      [
        row({
          status: 'CODE_ISSUED',
          issued_at: null,
          code_expires_at: '2026-09-04T12:10:00.000Z',
        }),
      ],
      NOW
    );

    expect(result.state).toBe('SPOKEN_FOR');
    expect(result.available_count).toBe(0);
    expect(result.holder).toBeNull();
    expect(result.issued_at).toBeNull();
  });

  // Matches check_key_capacity() in 20260906120000_key_count_as_capacity.sql:
  // a weekend request awaiting a decision holds no physical key, so it must not
  // consume capacity — otherwise a pending approval blocks the whole bunch.
  it.each(['PENDING_HOD', 'APPROVED'] as const)(
    'does not consume capacity for status %s',
    (status) => {
      const result = deriveKeyAvailability(KEY, [row({ status })], NOW);

      expect(result.state).toBe('AVAILABLE');
      expect(result.available_count).toBe(1);
      expect(result.holder).toBeNull();
    }
  );

  it('frees the key again once a CODE_ISSUED code has lapsed', () => {
    const result = deriveKeyAvailability(
      KEY,
      [
        row({
          status: 'CODE_ISSUED',
          issued_at: null,
          code_expires_at: '2026-09-04T11:50:00.000Z',
        }),
      ],
      NOW
    );

    expect(result.state).toBe('AVAILABLE');
    expect(result.available_count).toBe(1);
  });

  it('names a guest holder and flags them as external', () => {
    const result = deriveKeyAvailability(
      KEY,
      [row({ requester: null, guest: { full_name: 'Jane Doe' } })],
      NOW
    );

    expect(result.holder).toEqual({ full_name: 'Jane Doe', is_guest: true });
  });

  it('returns a null holder when neither requester nor guest resolves', () => {
    const result = deriveKeyAvailability(
      KEY,
      [row({ requester: null, guest: null })],
      NOW
    );

    expect(result.state).toBe('OUT');
    expect(result.holder).toBeNull();
    expect(result.holders).toEqual([]);
  });

  // A bunch of three keys stays requestable while two of them are out, and
  // still names who is holding the ones that are.
  it('reports remaining capacity on a partially-issued bunch', () => {
    const result = deriveKeyAvailability(
      { id: 'key-1', status: 'ISSUED', key_count: 3 },
      [
        row({ created_at: '2026-09-04T10:00:00.000Z',
              requester: { full_name: 'Dr. Adeyemi' } }),
        row(),
      ],
      NOW
    );

    expect(result.state).toBe('AVAILABLE');
    expect(result.key_count).toBe(3);
    expect(result.available_count).toBe(1);
    expect(result.holders.map((h) => h.full_name)).toEqual([
      'Dr. Bakare',
      'Dr. Adeyemi',
    ]);
  });

  it('reports OUT once every key in the bunch is issued', () => {
    const result = deriveKeyAvailability(
      { id: 'key-1', status: 'ISSUED', key_count: 2 },
      [
        row({ created_at: '2026-09-04T10:00:00.000Z',
              requester: { full_name: 'Dr. Adeyemi' } }),
        row(),
      ],
      NOW
    );

    expect(result.state).toBe('OUT');
    expect(result.available_count).toBe(0);
  });

  it('treats a null key_count as a single key', () => {
    const result = deriveKeyAvailability(
      { id: 'key-1', status: 'AVAILABLE', key_count: null },
      [row()],
      NOW
    );

    expect(result.key_count).toBe(1);
    expect(result.state).toBe('OUT');
  });

  // The physically-held row must win over a merely-reserved one, whatever
  // order the rows arrive in.
  it('prefers the KEY_ISSUED row over an earlier-created reservation', () => {
    const result = deriveKeyAvailability(
      { id: 'key-1', status: 'ISSUED', key_count: 2 },
      [
        row({
          status: 'CODE_ISSUED',
          created_at: '2026-09-04T08:00:00.000Z',
          issued_at: null,
          code_expires_at: '2026-09-04T12:10:00.000Z',
          requester: { full_name: 'Dr. Adeyemi' },
        }),
        row(),
      ],
      NOW
    );

    expect(result.state).toBe('OUT');
    expect(result.holder?.full_name).toBe('Dr. Bakare');
  });

  it('prefers the earliest KEY_ISSUED row when two keys are both out', () => {
    const result = deriveKeyAvailability(
      KEY,
      [
        row({
          created_at: '2026-09-04T10:00:00.000Z',
          requester: { full_name: 'Dr. Adeyemi' },
        }),
        row({ created_at: '2026-09-04T09:00:00.000Z' }),
      ],
      NOW
    );

    expect(result.holder?.full_name).toBe('Dr. Bakare');
  });

  // Regression guard: the output must never carry a collection or return code.
  // Widening the select list in the route is the mistake this catches.
  it('exposes only the documented fields', () => {
    const result = deriveKeyAvailability(KEY, [row()], NOW);

    expect(Object.keys(result).sort()).toEqual([
      'available_count',
      'holder',
      'holders',
      'issued_at',
      'key_count',
      'key_id',
      'return_deadline',
      'state',
    ]);
    expect(Object.keys(result.holder!).sort()).toEqual([
      'full_name',
      'is_guest',
    ]);
  });
});

describe('deriveKeyAvailabilityList', () => {
  it('groups requests by key and defaults unmatched keys to AVAILABLE', () => {
    const keys: KeyRow[] = [
      { id: 'key-1', status: 'ISSUED', key_count: 1 },
      { id: 'key-2', status: 'AVAILABLE', key_count: 1 },
      { id: 'key-3', status: 'RETIRED', key_count: 1 },
    ];

    const result = deriveKeyAvailabilityList(keys, [row()], NOW);

    expect(result.map((r) => [r.key_id, r.state])).toEqual([
      ['key-1', 'OUT'],
      ['key-2', 'AVAILABLE'],
      ['key-3', 'RETIRED'],
    ]);
  });

  it('ignores rows with a null key_id', () => {
    const result = deriveKeyAvailabilityList(
      [KEY],
      [row({ key_id: null })],
      NOW
    );

    expect(result[0].state).toBe('AVAILABLE');
  });

  it('returns an empty list when the requester holds no slots', () => {
    expect(deriveKeyAvailabilityList([], [row()], NOW)).toEqual([]);
  });
});
