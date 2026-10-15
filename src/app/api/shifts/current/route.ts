import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { rewriteStorageUrls } from '@/lib/storage/object-url';
import { createAdminClient } from '@/lib/supabase/admin';

export const GET = route({
  name: 'shifts/current',
  auth: 'user',
  roles: ['VERIFIER', 'CSO'],
  handler: async () => {
    // Use the admin client so the officer profile joins are not blocked by
    // RLS. route() has already checked the session and role.
    //
    // The `profiles_select` policy lets a user read only their own row (plus
    // CSO reads all, Dean reads their own unit) — there is no VERIFIER clause.
    // Under the session client PostgREST therefore silently returns
    // `primary_officer: null` whenever the shift belongs to a *different*
    // officer, which is exactly the handover case. That null then crashed
    // /verifier/handover.
    const { data: shift, error } = await createAdminClient()
      .from('shifts')
      .select(
        `id, shift_number, started_at, ended_at,
         primary_officer:profiles!primary_officer_id(id, full_name, photo_url),
         secondary_officer:profiles!secondary_officer_id(id, full_name, photo_url)`
      )
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return respond.internal('shifts/current: query failed', {
        err: error.message,
      });
    }

    return respond.ok(rewriteStorageUrls({ shift }));
  },
});
