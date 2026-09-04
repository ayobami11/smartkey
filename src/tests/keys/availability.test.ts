import { describe, expect, it } from 'vitest';

import {
  deriveKeyAvailability,
  deriveKeyAvailabilityList,
  type ActiveRequestRow,
  type KeyRow,
} from '@/lib/keys/availability';

const KEY: KeyRow = { id: 'key-1', status: 'AVAILABLE' };
const NOW = new Date('2026-09-04T12:00:00.000Z');

const row = (overrides: Partial<ActiveRequestRow> = {}): ActiveRequestRow => ({
  key_id: 'key-1',
  status: 'KEY_ISSUED',
  created_at: '2026-09-04T09:00:00.000Z',
  issued_at: '2026-09-04T09:05:00.000Z',
  return_deadline: '2026-09-04T17:00:00.000Z',
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
      return_deadline: null,
      issued_at: null,
      holder: null,
    });
  });

  it('reports RETIRED regardless of any active request', () => {
    const result = deriveKeyAvailability(
      { id: 'key-1', status: 'RETIRED' },
      [row()],
      NOW
    );

    expect(result.state).toBe('RETIRED');
    expect(result.holder).toBeNull();
  });

  it('reports OUT with the holder while the deadline is in the future', () => {
    const result = deriveKeyAvailability(KEY, [row()], NOW);

    expect(result.state).toBe('OUT');
    expect(result.holder).toEqual({
      full_name: 'Dr. Bakare',
      is_guest: false,
    });
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
  it.each(['PENDING_HOD', 'APPROVED', 'CODE_ISSUED'] as const)(
    'reports SPOKEN_FOR with no holder for status %s',
    (status) => {
      const result = deriveKeyAvailability(KEY, [row({ status })], NOW);

      expect(result.state).toBe('SPOKEN_FOR');
      expect(result.holder).toBeNull();
      expect(result.issued_at).toBeNull();
    }
  );

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
  });

  // Two people can hold live KEY_ISSUED requests for one physical key —
  // create_request only blocks a requester's own duplicate, and issue_key
  // never consults keys.status. The physically-held row must win over a
  // merely-reserved one, whatever order the rows arrive in.
  it('prefers the KEY_ISSUED row over a later-created SPOKEN_FOR one', () => {
    const result = deriveKeyAvailability(
      KEY,
      [
        row({
          status: 'CODE_ISSUED',
          created_at: '2026-09-04T08:00:00.000Z',
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

  it('falls back to the earliest row when none is KEY_ISSUED', () => {
    const result = deriveKeyAvailability(
      KEY,
      [
        row({ status: 'CODE_ISSUED', created_at: '2026-09-04T10:00:00.000Z' }),
        row({ status: 'PENDING_HOD', created_at: '2026-09-04T08:00:00.000Z' }),
      ],
      NOW
    );

    expect(result.state).toBe('SPOKEN_FOR');
  });

  // Regression guard: the output must never carry a collection or return code.
  // Widening the select list in the route is the mistake this catches.
  it('exposes only the five documented fields', () => {
    const result = deriveKeyAvailability(KEY, [row()], NOW);

    expect(Object.keys(result).sort()).toEqual([
      'holder',
      'issued_at',
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
      { id: 'key-1', status: 'ISSUED' },
      { id: 'key-2', status: 'AVAILABLE' },
      { id: 'key-3', status: 'RETIRED' },
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
