import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { rewriteStorageUrls } from '@/lib/storage/object-url';
import { createAdminClient } from '@/lib/supabase/admin';

const REQUEST_SELECT = `
  id,
  type,
  status,
  requested_for,
  risk_tier,
  risk_factors,
  created_at,
  requester:profiles!requester_id(id, full_name, photo_url),
  guest:guest_requesters!guest_id(id, full_name),
  key:keys!key_id(id, code, room_name, zone)
`;

// The verifier's queue of CODE_ISSUED requests. Read with the service role:
// the verifier must see every pending collection, guests included, and the
// route's VERIFIER gate is the check.
export const GET = route({
  name: 'requests/live-queue',
  auth: 'user',
  roles: ['VERIFIER'],
  handler: async ({ request }) => {
    const singleId = request.nextUrl.searchParams.get('id');
    const admin = createAdminClient();

    if (singleId) {
      // Targeted fetch for a single request (used by the Realtime INSERT
      // handler to avoid refetching the whole queue on each new item).
      const { data: row, error } = await admin
        .from('requests')
        .select(REQUEST_SELECT)
        .eq('id', singleId)
        .eq('status', 'CODE_ISSUED')
        .maybeSingle();

      if (error) {
        return respond.internal('requests/live-queue: single fetch failed', {
          err: error.message,
        });
      }

      return respond.ok(rewriteStorageUrls({ request: row }));
    }

    // Full queue fetch — initial load and fallback.
    const { data: requests, error } = await admin
      .from('requests')
      .select(REQUEST_SELECT)
      .eq('status', 'CODE_ISSUED')
      .order('created_at', { ascending: true });

    if (error) {
      return respond.internal('requests/live-queue: query failed', {
        err: error.message,
      });
    }

    return respond.ok(rewriteStorageUrls({ requests }));
  },
});
