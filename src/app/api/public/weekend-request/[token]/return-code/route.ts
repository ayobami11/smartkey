import * as z from 'zod';

import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { generateReturnCode } from '@/lib/requests/lifecycle';
import { createAdminClient } from '@/lib/supabase/admin';

// Unauthenticated guest analogue of requests/request-return: a 6-digit
// return code for the guest's own KEY_ISSUED request, keyed on the
// access_token. The step and its error copy live in the Request lifecycle
// module (src/lib/requests/lifecycle.ts). The response deliberately omits
// request_id, as it always has; the status page does not need it.
export const POST = route({
  name: 'public/weekend-request/return-code',
  auth: 'public',
  params: z.object({ token: z.uuid() }),
  paramsError: { status: 404, message: 'Request not found' },
  handler: async ({ params }) => {
    const result = await generateReturnCode(createAdminClient(), {
      kind: 'guest',
      accessToken: params.token,
    });
    if (!result.ok) return respond.error(result.error);

    return respond.ok({
      return_code: result.data.return_code,
      return_code_expires_at: result.data.return_code_expires_at,
    });
  },
});
