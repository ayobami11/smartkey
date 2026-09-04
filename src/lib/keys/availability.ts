/**
 * Derives, for a key a requester is authorised on, whether that key is free
 * to request and who currently holds it.
 *
 * Pure — no I/O, no JSX. The route at `src/app/api/keys/availability/route.ts`
 * does the fetching; everything below is testable in isolation.
 *
 * Deliberately NOT driven by `keys.status` alone. That column is maintained
 * correctly (issue_key -> ISSUED, return_key -> AVAILABLE, mark_key_overdue()
 * -> OVERDUE) but it cannot see the CODE_ISSUED / PENDING_HOD window, where a
 * key is spoken for but not yet physically collected.
 */

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

export type KeyAvailabilityState =
  | 'AVAILABLE'
  | 'SPOKEN_FOR'
  | 'OUT'
  | 'OVERDUE'
  | 'RETIRED';

/** The shape the route selects out of `requests`. Note what is absent:
 *  no `code`, no `return_code`, no `photo_url`, no `risk_tier`. */
export type ActiveRequestRow = {
  key_id: string | null;
  status: ActiveRequestStatus;
  created_at: string;
  issued_at: string | null;
  return_deadline: string | null;
  requester: { full_name: string } | null;
  guest: { full_name: string } | null;
};

export type KeyRow = {
  id: string;
  status: string;
};

export type KeyHolder = {
  full_name: string;
  is_guest: boolean;
};

export type KeyAvailability = {
  key_id: string;
  state: KeyAvailabilityState;
  return_deadline: string | null;
  issued_at: string | null;
  holder: KeyHolder | null;
};


/**
 * Picks the request that best represents the key's current state.
 *
 * More than one *active* request per key is normal — several people can hold
 * unexpired codes for the same key at once, since `create_request` only blocks
 * a requester's own duplicate (its conflict check is scoped to
 * `r.requester_id = v_requester_id`).
 *
 * At most one of them can be KEY_ISSUED, though: the partial unique index
 * `requests_one_live_issue_per_key` and the guard in `issue_key` enforce one
 * live holder per key (`20260904150000_issue_key_single_holder_guard.sql`).
 * Until that shipped two people genuinely could both be KEY_ISSUED on one key,
 * so the KEY_ISSUED branch below still resolves a set rather than assuming a
 * single row — it costs nothing, covers any pre-fix row, and this function
 * should not assume its input is well-formed.
 *
 * A KEY_ISSUED row wins because someone is physically holding the key;
 * otherwise the earliest-created row wins, as the one first in line.
 */
const pickRepresentative = (
  rows: ActiveRequestRow[]
): ActiveRequestRow | null => {
  if (rows.length === 0) return null;

  const issued = rows
    .filter((r) => r.status === 'KEY_ISSUED')
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (issued.length > 0) return issued[0];

  return [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
};

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
 * @param key       the key row (`id` and `status`)
 * @param requests  active requests for this key only — the caller filters
 * @param now       evaluation time, injected so tests are deterministic
 */
export const deriveKeyAvailability = (
  key: KeyRow,
  requests: ActiveRequestRow[],
  now: Date = new Date()
): KeyAvailability => {
  const base = {
    key_id: key.id,
    return_deadline: null,
    issued_at: null,
    holder: null,
  };

  if (key.status === 'RETIRED') {
    return { ...base, state: 'RETIRED' };
  }

  const row = pickRepresentative(requests);
  if (!row) {
    return { ...base, state: 'AVAILABLE' };
  }

  // Spoken for: a code exists (or is pending approval) but nobody has walked
  // to the desk yet. No holder is named — a request that may simply expire in
  // ten minutes is not worth disclosing a colleague's activity for.
  if (row.status !== 'KEY_ISSUED') {
    return {
      ...base,
      state: 'SPOKEN_FOR',
      return_deadline: row.return_deadline,
    };
  }

  // Overdue is derived from the deadline rather than read off `keys.status`,
  // which only flips on the hourly mark_key_overdue() cron. Same fallback
  // `src/app/api/keys/out/route.ts` applies, and it saves this screen a
  // second realtime subscription on `keys`.
  const overdue =
    row.return_deadline !== null && new Date(row.return_deadline) < now;

  return {
    key_id: key.id,
    state: overdue ? 'OVERDUE' : 'OUT',
    return_deadline: row.return_deadline,
    issued_at: row.issued_at,
    holder: resolveHolder(row),
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
