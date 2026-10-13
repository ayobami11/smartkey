/**
 * Key occupancy: how many copies of a room's key are held, reserved, overdue
 * and free.
 *
 * The rule lives in SQL. `public.request_occupies_key` and
 * `public.request_is_overdue` (migrations `20260906120000_key_count_as_capacity`
 * and `20261013110000_key_occupancy_rpc`) are the source of truth, and
 * `public.get_key_occupancy()` returns the per-key counts for the CSO
 * dashboard. TypeScript mirrors only the two one-line predicates below, for
 * code paths that already hold request rows in memory (the requester
 * availability route, the outstanding-keys lists). The two sides are held
 * together by matching truth tables: `src/tests/keys/occupancy.test.ts` and
 * `supabase/tests/11_key_occupancy_test.sql` use the same case labels. Change
 * one, change both.
 *
 * Pure — no I/O, no JSX.
 */

/** The fields `occupiesKey` reads. */
export type OccupancyInput = {
  status: string;
  code_expires_at: string | null;
};

/** The fields `isOverdue` reads. */
export type OverdueInput = {
  status: string;
  return_deadline: string | null;
};

/**
 * Mirrors `public.request_occupies_key(status, code_expires_at)`: a request
 * holds one copy while the key is physically out (`KEY_ISSUED`), or while a
 * collection code is live (`CODE_ISSUED` with an unexpired code). A
 * `CODE_ISSUED` row with no expiry counts as occupying, matching the SQL
 * `coalesce(... , true)`.
 */
export const occupiesKey = (row: OccupancyInput, now: Date): boolean => {
  if (row.status === 'KEY_ISSUED') return true;
  if (row.status !== 'CODE_ISSUED') return false;
  return row.code_expires_at === null || new Date(row.code_expires_at) > now;
};

/**
 * Mirrors `public.request_is_overdue(status, return_deadline)`: a key is
 * overdue when it is physically out and its deadline has passed. A holder with
 * no deadline is never overdue. Derived from the clock, not from
 * `keys.status = 'OVERDUE'`, which only flips on the hourly cron and cannot
 * tell one late holder of a multi-copy room from all of them.
 */
export const isOverdue = (row: OverdueInput, now: Date): boolean =>
  row.status === 'KEY_ISSUED' &&
  row.return_deadline !== null &&
  new Date(row.return_deadline) < now;

/** Per-key counts. Same fields, same meaning as `get_key_occupancy()`. */
export type KeyOccupancy = {
  /** How many interchangeable copies exist (`keys.key_count`, at least 1). */
  key_count: number;
  /** `keys.status = 'RETIRED'`. A retired key has nothing available. */
  retired: boolean;
  /** Copies physically out (`KEY_ISSUED`), overdue ones included. */
  issued: number;
  /** The subset of `issued` past its return deadline. */
  overdue: number;
  /** Copies reserved by a live collection code (`CODE_ISSUED`, unexpired). */
  reserved: number;
  /** `issued + reserved`. */
  occupied: number;
  /** `max(0, key_count - occupied)`, or 0 when retired. */
  available: number;
};

/** One row of `get_key_occupancy()`. */
export type KeyOccupancyRow = KeyOccupancy & {
  key_id: string;
  zone: string;
  unit_id: string;
};

export type KeyOccupancyState =
  | 'AVAILABLE'
  | 'SPOKEN_FOR'
  | 'OUT'
  | 'OVERDUE'
  | 'RETIRED';

/**
 * Counts the copies of one key from its request rows. The caller passes only
 * this key's requests; rows that do not occupy (terminal states, weekend
 * bookings, lapsed codes) are ignored, so passing a superset of statuses is
 * safe.
 */
export const occupancyOf = (
  key: { key_count: number | null; retired: boolean },
  requests: (OccupancyInput & OverdueInput)[],
  now: Date
): KeyOccupancy => {
  // `key_count` is NOT NULL with a `>= 1` check in the database; the coalesce
  // is for rows selected before the column existed in a given code path.
  const keyCount = Math.max(1, key.key_count ?? 1);

  let issued = 0;
  let overdue = 0;
  let reserved = 0;
  for (const row of requests) {
    if (!occupiesKey(row, now)) continue;
    if (row.status === 'KEY_ISSUED') {
      issued += 1;
      if (isOverdue(row, now)) overdue += 1;
    } else {
      reserved += 1;
    }
  }

  const occupied = issued + reserved;

  return {
    key_count: keyCount,
    retired: key.retired,
    issued,
    overdue,
    reserved,
    occupied,
    available: key.retired ? 0 : Math.max(0, keyCount - occupied),
  };
};

/**
 * The single state a requester-facing tile shows for a key:
 *
 * - `RETIRED` wins over everything.
 * - `AVAILABLE` while any copy is free — a partially-out room is requestable.
 * - Otherwise exhausted: `SPOKEN_FOR` when nobody physically holds a copy
 *   (every hold is a live code), `OVERDUE` when any holder is late, else `OUT`.
 */
export const stateOf = (occupancy: KeyOccupancy): KeyOccupancyState => {
  if (occupancy.retired) return 'RETIRED';
  if (occupancy.available > 0) return 'AVAILABLE';
  if (occupancy.issued === 0) return 'SPOKEN_FOR';
  if (occupancy.overdue > 0) return 'OVERDUE';
  return 'OUT';
};

/** Copy counts for one zone, for the CSO dashboard chart. */
export type ZoneOccupancy = {
  zone: 'NEW_SENATE' | 'OLD_SENATE';
  name: string;
  /** Copies across every non-retired key in the zone. */
  total: number;
  /** Copies out and still within their deadline. */
  issued: number;
  /** Copies out past their deadline. */
  overdue: number;
  /** Copies reserved by a live collection code. */
  reserved: number;
  /** Copies free to request. */
  available: number;
};

const ZONES: readonly { zone: ZoneOccupancy['zone']; name: string }[] = [
  { zone: 'NEW_SENATE', name: 'New Senate' },
  { zone: 'OLD_SENATE', name: 'Old Senate' },
];

/**
 * Sums `get_key_occupancy()` rows into one entry per zone, always both zones
 * and always in the same order. Counts **copies**, not key records: a room
 * with twelve copies contributes twelve. Retired keys are left out entirely.
 *
 * `issued` here excludes overdue copies, so the four slices are disjoint and
 * `issued + overdue + reserved + available === total` whenever no key is
 * over capacity (which the `requests_key_capacity` trigger prevents).
 */
export const summariseByZone = (rows: KeyOccupancyRow[]): ZoneOccupancy[] =>
  ZONES.map(({ zone, name }) => {
    const live = rows.filter((row) => row.zone === zone && !row.retired);
    const sum = (pick: (row: KeyOccupancyRow) => number) =>
      live.reduce((total, row) => total + pick(row), 0);

    return {
      zone,
      name,
      total: sum((row) => row.key_count),
      issued: sum((row) => row.issued - row.overdue),
      overdue: sum((row) => row.overdue),
      reserved: sum((row) => row.reserved),
      available: sum((row) => row.available),
    };
  });
