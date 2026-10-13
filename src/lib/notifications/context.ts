import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/types/database';

// Everything the notification rules need to know about one request, loaded
// in one place. Replaces four separate copies of the "registered requester
// or guest?" recipient join that used to live in the routes and crons.

type Authoriser = Database['public']['Enums']['department_authoriser'];

export type Preferences = Partial<
  Pick<
    Database['public']['Tables']['notification_preferences']['Row'],
    | 'weekend_decided_email'
    | 'weekend_submitted_email'
    | 'signature_mismatch_email'
    | 'overdue_email'
  >
>;

export type Person = {
  id: string;
  name: string;
  email: string | null;
  // null when the profile has never saved preferences: defaults apply.
  prefs: Preferences | null;
};

export type NotificationContext = {
  request: {
    id: string;
    type: 'WEEKDAY' | 'WEEKEND';
    requestedFor: string | null;
    returnDeadline: string | null;
    code: string | null;
    codeExpiresAt: string | null;
    accessToken: string | null;
    decisionToken: string | null;
    requestedRoom: string | null;
  };
  requester:
    | ({ kind: 'registered' } & Person)
    | { kind: 'guest'; name: string; email: string | null }
    | null;
  key: { code: string; roomName: string } | null;
  // The unit whose authoriser governs the request: the key's unit, or the
  // unit a guest asked for before a key was assigned.
  unit: { name: string; authoriser: Authoriser; dean: Person | null } | null;
  // Active CSOs.
  csos: Person[];
};

export type LoadContext = (
  requestId: string
) => Promise<NotificationContext | null>;

const one = <T>(value: T | T[] | null | undefined): T | null =>
  (Array.isArray(value) ? value[0] : value) ?? null;

export const loadNotificationContext: LoadContext = async (requestId) => {
  const admin = createAdminClient();

  const { data: req } = await admin
    .from('requests')
    .select(
      `id, type, requested_for, return_deadline, code, code_expires_at,
       access_token, decision_token, requested_room, requested_unit_id,
       key:keys!requests_key_id_fkey(code, room_name, unit_id),
       guest:guest_requesters!requests_guest_id_fkey(full_name, email),
       profile:profiles!requests_requester_id_fkey(id, full_name, institutional_email)`
    )
    .eq('id', requestId)
    .maybeSingle();

  if (!req) return null;

  const key = one(req.key);
  const guest = one(req.guest);
  const profile = one(req.profile);
  const unitId = key?.unit_id ?? req.requested_unit_id;

  const [unitRes, csoRes] = await Promise.all([
    unitId
      ? admin
          .from('units')
          .select('name, authoriser, hod_id')
          .eq('id', unitId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from('profiles')
      .select('id, full_name, institutional_email')
      .eq('role', 'CSO')
      .eq('status', 'ACTIVE'),
  ]);
  const unit = unitRes.data;
  const csoProfiles = csoRes.data ?? [];

  const { data: dean } = unit?.hod_id
    ? await admin
        .from('profiles')
        .select('id, full_name, institutional_email')
        .eq('id', unit.hod_id)
        .maybeSingle()
    : { data: null };

  const profileIds = [
    profile?.id,
    dean?.id,
    ...csoProfiles.map((c) => c.id),
  ].filter((id): id is string => !!id);

  const { data: prefRows } = profileIds.length
    ? await admin
        .from('notification_preferences')
        .select(
          'profile_id, weekend_decided_email, weekend_submitted_email, signature_mismatch_email, overdue_email'
        )
        .in('profile_id', profileIds)
    : { data: [] };
  const prefsById = new Map(
    (prefRows ?? []).map(({ profile_id, ...prefs }) => [profile_id, prefs])
  );

  const toPerson = (p: {
    id: string;
    full_name: string;
    institutional_email: string | null;
  }): Person => ({
    id: p.id,
    name: p.full_name,
    email: p.institutional_email,
    prefs: prefsById.get(p.id) ?? null,
  });

  return {
    request: {
      id: req.id,
      type: req.type,
      requestedFor: req.requested_for,
      returnDeadline: req.return_deadline,
      code: req.code,
      codeExpiresAt: req.code_expires_at,
      accessToken: req.access_token,
      decisionToken: req.decision_token,
      requestedRoom: req.requested_room,
    },
    requester: profile
      ? { kind: 'registered', ...toPerson(profile) }
      : guest
        ? { kind: 'guest', name: guest.full_name, email: guest.email }
        : null,
    key: key ? { code: key.code, roomName: key.room_name } : null,
    unit: unit
      ? {
          name: unit.name,
          authoriser: unit.authoriser,
          dean: dean ? toPerson(dean) : null,
        }
      : null,
    csos: csoProfiles.map(toPerson),
  };
};
