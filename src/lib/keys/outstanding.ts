/**
 * Shapes outstanding-key rows (`requests` in `KEY_ISSUED`) for display.
 *
 * There is no `KEY_OVERDUE` request status in the database — an overdue key is
 * a `KEY_ISSUED` request past its `return_deadline`. Every list of outstanding
 * keys used to derive that on its own; they now all go through `isOverdue`
 * from the occupancy module, so the rule has one TypeScript home that mirrors
 * `public.request_is_overdue`.
 *
 * Pure — no I/O, no JSX.
 */

import { isOverdue, type OverdueInput } from '@/lib/keys/occupancy';

/**
 * Adds `is_overdue` to each row. Use this where the row's own `status` is
 * read as-is (it stays `KEY_ISSUED`).
 */
export const withOverdueFlag = <T extends OverdueInput>(
  rows: T[],
  now: Date = new Date()
): (T & { is_overdue: boolean })[] =>
  rows.map((row) => ({ ...row, is_overdue: isOverdue(row, now) }));

type Person = { id: string; full_name: string; photo_url: string | null };
type Guest = { id: string; full_name: string };

/** The columns `GET /api/keys/out` and the verifier seed select. */
export type OutstandingSourceRow = OverdueInput & {
  requester: Person | null;
  guest: Guest | null;
};

export type ShapedOutstanding<T extends OutstandingSourceRow> = Omit<
  T,
  'guest' | 'requester'
> & {
  requester: Person | null;
  is_overdue: boolean;
};

/**
 * The `GET /api/keys/out` row shape:
 *
 * - `is_overdue` from the shared overdue rule;
 * - the row's real `status` (`KEY_ISSUED`), unchanged. Until 2026-10-19 an
 *   overdue row carried a synthetic `status: 'KEY_OVERDUE'` instead;
 * - a guest holder folded into `requester` (`photo_url: null`) so consumers
 *   render one person field. A registered requester takes precedence.
 */
export const shapeOutstanding = <T extends OutstandingSourceRow>(
  rows: T[],
  now: Date = new Date()
): ShapedOutstanding<T>[] =>
  rows.map((row) => {
    const { guest, requester, ...rest } = row;
    return {
      ...rest,
      requester:
        requester ??
        (guest
          ? { id: guest.id, full_name: guest.full_name, photo_url: null }
          : null),
      is_overdue: isOverdue(row, now),
    } as ShapedOutstanding<T>;
  });
