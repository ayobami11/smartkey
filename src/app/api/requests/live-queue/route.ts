import * as z from 'zod';

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

const querySchema = z.object({ id: z.string().optional() });

// The verifier's queue of CODE_ISSUED requests. Read with the service role:
// the verifier must see every pending collection, guests included, and the
// route's VERIFIER gate is the check.
export const GET = route({
  name: 'requests/live-queue',
  auth: 'user',
  roles: ['VERIFIER'],
  query: querySchema,
  handler: async ({ query }) => {
    const singleId = query.id;
    const admin = createAdminClient();

    if (singleId !== undefined) {
      // A malformed id can match no request, so answer it exactly like an
      // unknown one (the client drops a null) instead of letting Postgres
      // refuse the uuid cast with a 500.
      if (!z.uuid().safeParse(singleId).success) {
        return respond.ok({ request: null });
      }

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
