/**
 * Derives, for a key a requester is authorised on, whether that key is free
 * to request and who currently holds it.
 *
 * Pure — no I/O, no JSX. The route at `src/app/api/keys/availability/route.ts`
 * does the fetching; everything below is testable in isolation.
 *
 * The logic here mirrors the database's `derive_key_availability` function,
 * ensuring the UI and the database agree on key availability.
 *
 * Deliberately NOT driven by `keys.status` alone. That column is maintained
 * correctly, but it is a single scalar that can only say "exhausted or not" —
 * it cannot see the CODE_ISSUED window, nor express "3 of 12 out".
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

const occupiesKey = (row: ActiveRequestRow, now: Date): boolean => {
  if (row.status === 'KEY_ISSUED') return true;
  if (row.status !== 'CODE_ISSUED') return false;
  return row.code_expires_at === null || new Date(row.code_expires_at) > now;
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

const isOverdue = (row: ActiveRequestRow, now: Date): boolean =>
  row.return_deadline !== null && new Date(row.return_deadline) < now;

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
  // `key_count` is NOT NULL with a `>= 1` check in the database; the coalesce
  // is for rows selected before the column existed in a given code path.
  const capacity = Math.max(1, key.key_count ?? 1);

  const base = {
    key_id: key.id,
    key_count: capacity,
    return_deadline: null,
    issued_at: null,
    holder: null,
    holders: [],
  };

  // The key row's own status wins over any request.
  if (key.status === 'RETIRED') {
    return { ...base, state: 'RETIRED', available_count: 0 };
  }

  const occupying = requests.filter((row) => occupiesKey(row, now));
  const availableCount = Math.max(0, capacity - occupying.length);

  // Only physically-held keys name a person. A key merely reserved by a code
  // that may lapse in ten minutes is not worth disclosing a colleague's
  // activity over — so holders are drawn from KEY_ISSUED rows alone.
  const issued = occupying
    .filter((row) => row.status === 'KEY_ISSUED')
    .sort(byCreatedAt);

  const holders = issued
    .map(resolveHolder)
    .filter((h): h is KeyHolder => h !== null);

  // Singular fields describe the longest-standing holder where there is one,
  // so a partially-out bunch can still show "Held by X · collected 2 hrs ago"
  // while remaining requestable.
  const lead = issued[0] ?? null;

  if (availableCount > 0) {
    return {
      ...base,
      state: 'AVAILABLE',
      available_count: availableCount,
      return_deadline: lead?.return_deadline ?? null,
      issued_at: lead?.issued_at ?? null,
      holder: holders[0] ?? null,
      holders,
    };
  }

  // Exhausted. Which flavour depends on whether anyone is actually holding a
  // key or the bunch is merely fully reserved.
  if (issued.length === 0) {
    const earliestReservation = [...occupying].sort(byCreatedAt)[0] ?? null;
    return {
      ...base,
      state: 'SPOKEN_FOR',
      available_count: 0,
      return_deadline: earliestReservation?.return_deadline ?? null,
    };
  }

  // Overdue is derived from the deadline rather than read off `keys.status`,
  // which only flips on the hourly mark_key_overdue() cron — and which, for a
  // bunch, cannot distinguish one late holder from all of them. Same fallback
  // `src/app/api/keys/out/route.ts` applies.
  const overdue = issued.some((row) => isOverdue(row, now));

  return {
    key_id: key.id,
    state: overdue ? 'OVERDUE' : 'OUT',
    key_count: capacity,
    available_count: 0,
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
