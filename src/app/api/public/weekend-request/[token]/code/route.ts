import * as z from 'zod';

import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { generateCollectionCode } from '@/lib/requests/lifecycle';
import { createAdminClient } from '@/lib/supabase/admin';

// Unauthenticated guest analogue of requests/weekend-code: on the requested
// weekend date only, mints the collection code for the guest's APPROVED
// request, keyed on the access_token. The guest RPC is service-role only,
// hence the admin client. The step, its error copy and the code email live in
// the Request lifecycle module (src/lib/requests/lifecycle.ts).
export const POST = route({
  name: 'public/weekend-request/code',
  auth: 'public',
  params: z.object({ token: z.uuid() }),
  paramsError: { status: 404, message: 'Request not found' },
  handler: async ({ params }) => {
    const result = await generateCollectionCode(createAdminClient(), {
      kind: 'guest',
      accessToken: params.token,
    });
    if (!result.ok) return respond.error(result.error);

    return respond.ok({
      request_id: result.data.request_id,
      code: result.data.code,
      code_expires_at: result.data.code_expires_at,
    });
  },
});
