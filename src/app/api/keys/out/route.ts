import * as z from 'zod';

import {
  shapeOutstanding,
  type OutstandingSourceRow,
} from '@/lib/keys/outstanding';
import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { rewriteStorageUrls } from '@/lib/storage/object-url';
import { createAdminClient } from '@/lib/supabase/admin';
import { Constants } from '@/types/database';

const querySchema = z.object({
  zone: z.enum(Constants.public.Enums.zone).optional(),
  overdue_only: z.enum(['true', 'false']).optional(),
});

export const GET = route({
  name: 'keys/out',
  auth: 'user',
  roles: ['CSO', 'VERIFIER'],
  query: querySchema,
  handler: async ({ query: params }) => {
    const { zone } = params;
    const overdueOnly = params.overdue_only === 'true';

    // Use admin client so the requester profile join is not blocked by RLS.
    // route() has already checked the session and role.
    let query = createAdminClient()
      .from('requests')
      .select(
        `id, status, issued_at, return_deadline, created_at,
         requester:profiles!requester_id(id, full_name, photo_url),
         guest:guest_requesters!guest_id(id, full_name),
         key:keys!key_id${zone ? '!inner' : ''}(id, code, room_name, zone, status, key_count)`
      )
      .in('status', ['KEY_ISSUED']);

    if (overdueOnly) {
      query = query.lt('return_deadline', new Date().toISOString());
    }

    // A filter on an embedded table only drops parent rows when the embed is
    // an inner join; with the default left join (and the alias-less path used
    // until 2026-10-15) every outstanding key came back whatever the zone.
    if (zone) {
      query = query.eq('key.zone', zone);
    }

    query = query.order('return_deadline', { ascending: true });

    const { data, error } = await query;

    if (error) {
      return respond.internal('keys/out: query failed', {
        err: error.message,
      });
    }

    // `is_overdue` comes from the shared overdue rule; `status` stays the
    // row's own KEY_ISSUED. See src/lib/keys/outstanding.ts.
    const outstanding = shapeOutstanding(
      (data ?? []) as unknown as OutstandingSourceRow[]
    );

    return respond.ok(rewriteStorageUrls({ outstanding }));
  },
});
