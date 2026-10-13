/**
 * Derives, for a key a requester is authorised on, whether that key is free
 * to request and who currently holds it.
 *
 * Pure — no I/O, no JSX. The route at `src/app/api/keys/availability/route.ts`
 * does the fetching; everything below is testable in isolation.

 * Deliberately NOT driven by `keys.status` alone. That column is maintained
 * correctly, but it is a single scalar that can only say "exhausted or not" —
 * it cannot see the CODE_ISSUED window, nor express "3 of 12 out".
 *
 * Counts and state come from `src/lib/keys/occupancy.ts`, which mirrors the
 * SQL occupancy rule; this file only adds who is holding a copy.
 */

import {
  occupancyOf,
  occupiesKey,
  stateOf,
  type KeyOccupancyState,
} from '@/lib/keys/occupancy';

/** Request statuses that mean a key is not free. Mirrors the set
 *  `create_request` treats as an active request (everything except the four
 *  terminal states KEY_RETURNED / EXPIRED / CANCELLED / DECLINED). */
export const ACTIVE_REQUEST_STATUSES = [
  'PENDING_HOD',
  'APPROVED',
  'CODE_ISSUED',
  'KEY_ISSUED',
] as const;

export type ActiveRequestStatus = (typeof ACTIVE_REQUEST_STATUSES)[number];

/** Same states the occupancy module derives; see `stateOf`. */
export type KeyAvailabilityState = KeyOccupancyState;

/** The shape the route selects out of `requests`. Note what is absent:
 *  no `code`, no `return_code`, no `photo_url`, no `risk_tier`.
 *
 *  `code_expires_at` IS selected, and is the one field here that never reaches
 *  the response — it is needed to mirror the database's occupancy rule (a
 *  lapsed code frees its key immediately) and it discloses nothing about the
 *  code's value. */
export type ActiveRequestRow = {
  key_id: string | null;
  status: ActiveRequestStatus;
  created_at: string;
  issued_at: string | null;
  return_deadline: string | null;
  code_expires_at: string | null;
  requester: { full_name: string } | null;
  guest: { full_name: string } | null;
};

export type KeyRow = {
  id: string;
  status: string;
  key_count: number | null;
};

export type KeyHolder = {
  full_name: string;
  is_guest: boolean;
};

export type KeyAvailability = {
  key_id: string;
  state: KeyAvailabilityState;
  /** Size of the bunch — how many physical keys this record represents. */
  key_count: number;
  /** How many of them are neither out nor reserved right now. */
  available_count: number;
  return_deadline: string | null;
  issued_at: string | null;
  /** The longest-standing holder, or null. Retained so callers that predate
   *  multi-key bunches keep working unchanged. */
  holder: KeyHolder | null;
  /** Everyone physically holding a key from this bunch, earliest first. */
  holders: KeyHolder[];
};

const byCreatedAt = (a: ActiveRequestRow, b: ActiveRequestRow) =>
  a.created_at.localeCompare(b.created_at);

const resolveHolder = (row: ActiveRequestRow): KeyHolder | null => {
  if (row.requester) {
    return { full_name: row.requester.full_name, is_guest: false };
  }
  if (row.guest) {
    return { full_name: row.guest.full_name, is_guest: true };
  }
  return null;
};

/**
 * @param key       the key row (`id`, `status`, `key_count`)
 * @param requests  active requests for this key only — the caller filters
 * @param now       evaluation time, injected so tests are deterministic
 */
export const deriveKeyAvailability = (
  key: KeyRow,
  requests: ActiveRequestRow[],
  now: Date = new Date()
): KeyAvailability => {
  // Counts and state come from the shared occupancy module, so this route,
  // the CSO chart (via get_key_occupancy) and the capacity trigger agree on
  // what "free" means. Everything below only decides which names to show.
  const occupancy = occupancyOf(
    { key_count: key.key_count, retired: key.status === 'RETIRED' },
    requests,
    now
  );
  const state = stateOf(occupancy);

  const base = {
    key_id: key.id,
    state,
    key_count: occupancy.key_count,
    available_count: occupancy.available,
    return_deadline: null,
    issued_at: null,
    holder: null,
    holders: [],
  };

  // The key row's own status wins over any request.
  if (state === 'RETIRED') return base;

  // Exhausted with nobody physically holding a copy: every hold is a live
  // code. Name nobody — a code that may lapse in ten minutes is not worth
  // disclosing a colleague's activity over.
  if (state === 'SPOKEN_FOR') {
    const earliestReservation =
      requests.filter((row) => occupiesKey(row, now)).sort(byCreatedAt)[0] ??
      null;
    return {
      ...base,
      return_deadline: earliestReservation?.return_deadline ?? null,
    };
  }

  // Only physically-held keys name a person, earliest first.
  const issued = requests
    .filter((row) => row.status === 'KEY_ISSUED')
    .sort(byCreatedAt);

  const holders = issued
    .map(resolveHolder)
    .filter((h): h is KeyHolder => h !== null);

  // Singular fields describe the longest-standing holder where there is one,
  // so a partially-out bunch can still show "Held by X · collected 2 hrs ago"
  // while remaining requestable.
  const lead = issued[0] ?? null;

  return {
    ...base,
    return_deadline: lead?.return_deadline ?? null,
    issued_at: lead?.issued_at ?? null,
    holder: holders[0] ?? null,
    holders,
  };
};

/**
 * Convenience wrapper: groups `requests` by `key_id` and derives every key in
 * one pass. Keys with no active request come back AVAILABLE.
 */
export const deriveKeyAvailabilityList = (
  keys: KeyRow[],
  requests: ActiveRequestRow[],
  now: Date = new Date()
): KeyAvailability[] => {
  const byKey = new Map<string, ActiveRequestRow[]>();
  for (const row of requests) {
    if (!row.key_id) continue;
    const existing = byKey.get(row.key_id);
    if (existing) existing.push(row);
    else byKey.set(row.key_id, [row]);
  }

  return keys.map((key) =>
    deriveKeyAvailability(key, byKey.get(key.id) ?? [], now)
  );
};
