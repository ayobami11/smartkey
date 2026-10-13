import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { rewriteStorageUrls } from '@/lib/storage/object-url';

// High-risk requests from the last 24 hours that are issuable or issued — a
// review surface for the CSO, not a gate in front of collection.
export const GET = route({
  name: 'requests/cso-queue',
  auth: 'user',
  roles: ['CSO'],
  handler: async ({ supabase }) => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: requests, error } = await supabase
      .from('requests')
      .select(
        `
      id,
      type,
      status,
      requested_for,
      return_deadline,
      risk_tier,
      risk_factors,
      created_at,
      requester:profiles!requester_id(id, full_name, photo_url, institutional_email),
      key:keys!key_id(id, code, room_name, zone, unit_id)
    `
      )
      .eq('risk_tier', 'HIGH')
      .in('status', ['CODE_ISSUED', 'KEY_ISSUED'])
      .gte('created_at', since)
      .order('created_at', { ascending: false });

    if (error) {
      return respond.internal('requests/cso-queue: query failed', {
        err: error.message,
      });
    }

    return respond.ok(rewriteStorageUrls({ requests }));
  },
});
