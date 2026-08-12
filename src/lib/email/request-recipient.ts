import type { createAdminClient } from '@/lib/supabase/admin';

// Shared recipient lookup for a single `requests` row — registered requester
// or guest, plus the key's display code and room name. Mirrors the join
// already inlined in src/app/api/requests/hod-decision/route.ts's
// notifyRequester; that file is left as-is (it already works), this is for
// the newer collection-code call sites.
export const getRequestRecipient = async (
  admin: ReturnType<typeof createAdminClient>,
  requestId: string
): Promise<{
  to: string;
  fullName: string;
  keyCode: string;
  roomName: string;
  isGuest: boolean;
} | null> => {
  const { data: req } = await admin
    .from('requests')
    .select(
      'requester_id, guest_id, key:keys(code, room_name), guest:guest_requesters(full_name, email), profile:profiles!requests_requester_id_fkey(full_name, institutional_email)'
    )
    .eq('id', requestId)
    .single();

  if (!req) return null;

  const key = Array.isArray(req.key) ? req.key[0] : req.key;
  const keyCode = key?.code ?? '';
  const roomName = key?.room_name ?? '';

  if (req.guest_id) {
    const guest = Array.isArray(req.guest) ? req.guest[0] : req.guest;
    if (!guest?.email) return null;
    return {
      to: guest.email,
      fullName: guest.full_name,
      keyCode,
      roomName,
      isGuest: true,
    };
  }

  const profile = Array.isArray(req.profile) ? req.profile[0] : req.profile;
  if (!profile?.institutional_email) return null;
  return {
    to: profile.institutional_email,
    fullName: profile.full_name,
    keyCode,
    roomName,
    isGuest: false,
  };
};

export const getDeanRecipientForUnit = async (
  admin: ReturnType<typeof createAdminClient>,
  unitId: string
): Promise<{ to: string; fullName: string; unitName: string } | null> => {
  const { data: unit } = await admin
    .from('units')
    .select('name, authoriser, hod_id')
    .eq('id', unitId)
    .single();

  if (!unit || unit.authoriser !== 'DEAN' || !unit.hod_id) return null;

  const { data: dean } = await admin
    .from('profiles')
    .select('full_name, institutional_email')
    .eq('id', unit.hod_id)
    .single();

  if (!dean?.institutional_email) return null;

  const { data: pref } = await admin
    .from('notification_preferences')
    .select('weekend_submitted_email')
    .eq('profile_id', unit.hod_id)
    .maybeSingle();
  if (pref && !pref.weekend_submitted_email) return null;

  return {
    to: dean.institutional_email,
    fullName: dean.full_name,
    unitName: unit.name,
  };
};

export const getDeanRecipientForKey = async (
  admin: ReturnType<typeof createAdminClient>,
  keyId: string
): Promise<{ to: string; fullName: string; unitName: string } | null> => {
  const { data: key } = await admin
    .from('keys')
    .select('unit_id')
    .eq('id', keyId)
    .single();

  if (!key?.unit_id) return null;
  return getDeanRecipientForUnit(admin, key.unit_id);
};
