import {
  shapeOutstanding,
  type OutstandingSourceRow,
} from '@/lib/keys/outstanding';
import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { rewriteStorageUrls } from '@/lib/storage/object-url';
import { createAdminClient } from '@/lib/supabase/admin';

export const GET = route({
  name: 'keys/out',
  auth: 'user',
  roles: ['CSO', 'VERIFIER'],
  handler: async ({ request }) => {
    const { searchParams } = new URL(request.url);
    const zone = searchParams.get('zone');
    const overdueOnly = searchParams.get('overdue_only') === 'true';

    // Use admin client so the requester profile join is not blocked by RLS.
    // route() has already checked the session and role.
    let query = createAdminClient()
      .from('requests')
      .select(
        `id, status, issued_at, return_deadline, created_at,
         requester:profiles!requester_id(id, full_name, photo_url),
         guest:guest_requesters!guest_id(id, full_name),
         key:keys!key_id(id, code, room_name, zone, status, key_count)`
      )
      .in('status', ['KEY_ISSUED']);

    if (overdueOnly) {
      query = query.lt('return_deadline', new Date().toISOString());
    }

    if (zone) {
      query = query.eq('key:keys!key_id.zone', zone);
    }

    query = query.order('return_deadline', { ascending: true });

    const { data, error } = await query;

    if (error) return respond.fail(500, 'Failed to fetch outstanding keys');

    // `is_overdue` (and the deprecated `status: 'KEY_OVERDUE'`) come from the
    // shared overdue rule; see src/lib/keys/outstanding.ts.
    const outstanding = shapeOutstanding(
      (data ?? []) as unknown as OutstandingSourceRow[]
    );

    return respond.ok(rewriteStorageUrls({ outstanding }));
  },
});
