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
