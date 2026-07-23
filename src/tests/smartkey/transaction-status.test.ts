import { describe, expect, it } from 'vitest';

import { formatDate } from '@/lib/dates';
import {
  getTransactionDate,
  getTransactionReturnLine,
  type Transaction,
} from '@/components/smartkey/transaction-status';

const baseTx: Transaction = {
  id: 'req-1',
  type: 'WEEKDAY',
  status: 'KEY_ISSUED',
  requested_for: '2026-06-01T00:00:00.000Z',
  issued_at: '2026-06-01T09:00:00.000Z',
  returned_at: null,
  return_deadline: '2026-06-01T17:00:00.000Z',
  created_at: '2026-06-01T08:00:00.000Z',
  requester: { id: 'u-1', full_name: 'Dr. Bakare' },
  key: {
    id: 'k-1',
    code: 'NS-304',
    room_name: 'Senate Hall A',
    zone: 'NEW_SENATE',
  },
};

describe('getTransactionDate', () => {
  it('uses issued_at for an issued transaction', () => {
    expect(getTransactionDate(baseTx)).toBe(baseTx.issued_at);
  });

  it('uses issued_at for a returned transaction', () => {
    const tx: Transaction = { ...baseTx, status: 'KEY_RETURNED' };
    expect(getTransactionDate(tx)).toBe(baseTx.issued_at);
  });

  it('falls back to requested_for when issued/returned but issued_at is null', () => {
    const tx: Transaction = {
      ...baseTx,
      status: 'KEY_RETURNED',
      issued_at: null,
    };
    expect(getTransactionDate(tx)).toBe(baseTx.requested_for);
  });

  it.each(['EXPIRED', 'CANCELLED', 'DECLINED'] as const)(
    'uses requested_for for a %s transaction, even when issued_at is set',
    (status) => {
      const tx: Transaction = { ...baseTx, status };
      expect(getTransactionDate(tx)).toBe(baseTx.requested_for);
    }
  );
});

describe('getTransactionReturnLine', () => {
  it('returns null for an issued-but-not-due-context-independent status like EXPIRED', () => {
    const tx: Transaction = { ...baseTx, status: 'EXPIRED' };
    expect(getTransactionReturnLine(tx)).toBeNull();
  });

  it('shows the return deadline while the key is issued', () => {
    expect(getTransactionReturnLine(baseTx)).toBe(
      `Due ${formatDate(baseTx.return_deadline)}`
    );
  });

  it('shows the return date once the key has been returned', () => {
    const tx: Transaction = {
      ...baseTx,
      status: 'KEY_RETURNED',
      returned_at: '2026-06-01T16:00:00.000Z',
    };
    expect(getTransactionReturnLine(tx)).toBe(
      `Returned ${formatDate(tx.returned_at as string)}`
    );
  });

  it('returns null for a returned transaction with no returned_at (defensive)', () => {
    const tx: Transaction = {
      ...baseTx,
      status: 'KEY_RETURNED',
      returned_at: null,
    };
    expect(getTransactionReturnLine(tx)).toBeNull();
  });
});
