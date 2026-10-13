import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import {
  ACTIVE_REQUEST_STATUSES,
  deriveKeyAvailabilityList,
  type ActiveRequestRow,
} from '@/lib/keys/availability';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/keys/availability
 *
 * Tells a requester whether each key they are authorised on is free, and who
 * is holding it if not — so they can stop walking to the Senate Building desk
 * to find out.
 *
 * RLS deliberately stays untouched. `requests_select` scopes a REQUESTER to
 * their own rows, and that table holds `code` and `return_code`; a policy
 * loose enough to expose a holder's name would expose live collection codes
 * to every co-authorised requester. So this route reads past RLS with the
 * admin client and applies its own scope check, exactly as
 * `src/app/api/keys/out/route.ts` does for the verifier and CSO.
 *
 * No `rewriteStorageUrls` here, by design: the select list carries no storage
 * URL. Holders are named, never pictured — the passport photo exists for desk
 * identity verification, not for peer browsing.
 */
export const GET = route({
  name: 'keys/availability',
  auth: 'user',
  roles: ['REQUESTER'],
  handler: async ({ supabase, user }) => {
    // The security boundary of this route. `authorisations_select_all` is
    // USING (true), so RLS does NOT scope this read — the explicit filter on
    // the session user's id does. It must never be driven by a
    // client-supplied parameter: that would turn this into a lookup of
    // anyone's key holders.
    const { data: slots, error: slotsError } = await supabase
      .from('authorisations')
      .select('key_id')
      .eq('profile_id', user.id);

    if (slotsError) {
      return respond.internal('keys/availability authorisations query failed', {
        err: slotsError.message,
      });
    }

    const keyIds = (slots ?? []).map((s) => s.key_id);
    if (keyIds.length === 0) return respond.ok({ keys: [] });

    const admin = createAdminClient();

    const { data: keys, error: keysError } = await admin
      .from('keys')
      .select('id, status, key_count')
      .in('id', keyIds);

    if (keysError) {
      return respond.internal('keys/availability keys query failed', {
        err: keysError.message,
      });
    }

    // Only the fields the tile renders. Never `code`, `return_code`,
    // `photo_url`, `risk_tier`, or anything else about the holder.
    const { data: requests, error: requestsError } = await admin
      .from('requests')
      .select(
        `key_id, status, created_at, issued_at, return_deadline, code_expires_at,
         requester:profiles!requester_id(full_name),
         guest:guest_requesters!guest_id(full_name)`
      )
      .in('key_id', keyIds)
      .in('status', [...ACTIVE_REQUEST_STATUSES]);

    if (requestsError) {
      return respond.internal('keys/availability requests query failed', {
        err: requestsError.message,
      });
    }

    const availability = deriveKeyAvailabilityList(
      keys ?? [],
      (requests ?? []) as unknown as ActiveRequestRow[]
    );

    return respond.ok({ keys: availability });
  },
});
