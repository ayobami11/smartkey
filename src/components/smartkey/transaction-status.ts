import {
  BanIcon,
  CheckIcon,
  ClockIcon,
  HourglassIcon,
  XCircleIcon,
} from 'lucide-react';

import { formatDate } from '@/lib/dates';

export type Transaction = {
  id: string;
  type: 'WEEKDAY' | 'WEEKEND';
  status: 'KEY_ISSUED' | 'KEY_RETURNED' | 'EXPIRED' | 'CANCELLED' | 'DECLINED';
  requested_for: string;
  issued_at: string | null;
  returned_at: string | null;
  return_deadline: string;
  created_at: string;
  requester: { id: string; full_name: string } | null;
  key: {
    id: string;
    code: string;
    room_name: string;
    zone: 'NEW_SENATE' | 'OLD_SENATE';
  } | null;
};

export const TRANSACTION_STATUS_CONFIG = {
  KEY_ISSUED: {
    label: 'Issued',
    stripe: 'bg-amber-500',
    badge:
      'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400',
    Icon: ClockIcon,
  },
  KEY_RETURNED: {
    label: 'Returned',
    stripe: 'bg-emerald-500',
    badge:
      'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
    Icon: CheckIcon,
  },
  EXPIRED: {
    label: 'Expired',
    stripe: 'bg-muted-foreground',
    badge: 'bg-muted text-muted-foreground',
    Icon: HourglassIcon,
  },
  CANCELLED: {
    label: 'Cancelled',
    stripe: 'bg-muted-foreground',
    badge: 'bg-muted text-muted-foreground',
    Icon: XCircleIcon,
  },
  DECLINED: {
    label: 'Declined',
    stripe: 'bg-destructive',
    badge: 'bg-destructive/10 text-destructive',
    Icon: BanIcon,
  },
} as const;

// The timestamp a transaction is anchored to: when it was issued/returned
// falls back to the requested date; anything else (expired/cancelled/
// declined) never had an issue date, so it's always the requested date.
export const getTransactionDate = (tx: Transaction): string =>
  tx.status === 'KEY_ISSUED' || tx.status === 'KEY_RETURNED'
    ? (tx.issued_at ?? tx.requested_for)
    : tx.requested_for;

// Secondary line under the status badge: when it came back, or when it's due.
export const getTransactionReturnLine = (tx: Transaction): string | null => {
  if (tx.status === 'KEY_RETURNED' && tx.returned_at)
    return `Returned ${formatDate(tx.returned_at)}`;
  if (tx.status === 'KEY_ISSUED')
    return `Due ${formatDate(tx.return_deadline)}`;
  return null;
};
