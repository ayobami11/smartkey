import * as z from 'zod';

import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { expireCollectionCode } from '@/lib/requests/lifecycle';

const bodySchema = z.object({
  request_id: z.uuid(),
});

// Fired by the UI when a collection code's countdown reaches 0. No role gate:
// expire_request itself refuses anyone but the request's owner. Idempotent —
// a request that already moved on comes back with its current status. The
// step and its error copy live in the Request lifecycle module
// (src/lib/requests/lifecycle.ts), shared with the guest route.
export const POST = route({
  name: 'requests/expire',
  auth: 'user',
  body: bodySchema,
  handler: async ({ supabase, user, body }) => {
    const result = await expireCollectionCode(supabase, {
      kind: 'registered',
      requestId: body.request_id,
      requesterId: user.id,
    });
    if (!result.ok) return respond.error(result.error);

    return respond.ok({
      request_id: result.data.request_id,
      status: result.data.status,
    });
  },
});
