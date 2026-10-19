import * as z from 'zod';

import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { expireCollectionCode } from '@/lib/requests/lifecycle';
import { createAdminClient } from '@/lib/supabase/admin';

// Unauthenticated guest analogue of requests/expire, fired by the status page
// when a collection code's countdown reaches 0. Idempotent — returns the
// current status with no error if the request already moved on. The step and
// its error copy live in the Request lifecycle module
// (src/lib/requests/lifecycle.ts).
export const POST = route({
  name: 'public/weekend-request/expire',
  auth: 'public',
  params: z.object({ token: z.uuid() }),
  paramsError: { status: 404, message: 'Request not found' },
  handler: async ({ params }) => {
    const result = await expireCollectionCode(createAdminClient(), {
      kind: 'guest',
      accessToken: params.token,
    });
    if (!result.ok) return respond.error(result.error);

    return respond.ok({
      request_id: result.data.request_id,
      status: result.data.status,
    });
  },
});
