import { describe, expect, it } from 'vitest';

import { shapeOutstanding, withOverdueFlag } from '@/lib/keys/outstanding';

const NOW = new Date('2026-10-13T12:00:00.000Z');
const PAST = '2026-10-13T11:00:00.000Z';
const FUTURE = '2026-10-13T17:00:00.000Z';

const person = { id: 'p-1', full_name: 'Dr. Bakare', photo_url: 'photo' };
const guest = { id: 'g-1', full_name: 'Jane Doe' };

const source = (
  overrides: Partial<{
    status: string;
    return_deadline: string | null;
    requester: typeof person | null;
    guest: typeof guest | null;
  }> = {}
) => ({
  id: 'req-1',
  status: 'KEY_ISSUED',
  return_deadline: FUTURE,
  issued_at: '2026-10-13T09:00:00.000Z',
  key: { id: 'key-1', code: 'NS-304' },
  requester: person as typeof person | null,
  guest: null as typeof guest | null,
  ...overrides,
});

describe('withOverdueFlag', () => {
  it('flags a KEY_ISSUED row past its deadline and leaves status alone', () => {
    const [row] = withOverdueFlag([source({ return_deadline: PAST })], NOW);

    expect(row.is_overdue).toBe(true);
    expect(row.status).toBe('KEY_ISSUED');
  });

  it('does not flag a row before its deadline, or with none', () => {
    const rows = withOverdueFlag(
      [source(), source({ return_deadline: null })],
      NOW
    );

    expect(rows.map((r) => r.is_overdue)).toEqual([false, false]);
  });
});

describe('shapeOutstanding', () => {
  it('adds is_overdue and the deprecated KEY_OVERDUE status together', () => {
    const [late, onTime] = shapeOutstanding(
      [source({ return_deadline: PAST }), source()],
      NOW
    );

    expect(late.is_overdue).toBe(true);
    expect(late.status).toBe('KEY_OVERDUE');
    expect(onTime.is_overdue).toBe(false);
    expect(onTime.status).toBe('KEY_ISSUED');
  });

  it('folds a guest holder into requester with no photo', () => {
    const [row] = shapeOutstanding([source({ requester: null, guest })], NOW);

    expect(row.requester).toEqual({
      id: 'g-1',
      full_name: 'Jane Doe',
      photo_url: null,
    });
    expect(row).not.toHaveProperty('guest');
  });

  it('prefers the registered requester over a guest', () => {
    const [row] = shapeOutstanding([source({ guest })], NOW);

    expect(row.requester).toEqual(person);
  });

  it('returns a null requester when neither resolves', () => {
    const [row] = shapeOutstanding([source({ requester: null })], NOW);

    expect(row.requester).toBeNull();
  });

  it('keeps the other selected columns unchanged', () => {
    const [row] = shapeOutstanding([source()], NOW);

    expect(row).toMatchObject({
      id: 'req-1',
      issued_at: '2026-10-13T09:00:00.000Z',
      key: { id: 'key-1', code: 'NS-304' },
    });
  });
});
