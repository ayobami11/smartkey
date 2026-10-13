import * as z from 'zod';

import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { rpcFail } from '@/lib/http/rpc-errors';
import { notifyAfterResponse } from '@/lib/notifications/notify';
import { callRpc } from '@/lib/rpc/call-rpc';
import { createAdminClient } from '@/lib/supabase/admin';

// Unauthenticated. On the requested weekend date only, mints a short-lived
// 6-digit collection code for an APPROVED guest request, keyed on the
// access_token. Calls the SECURITY DEFINER RPC via the service-role client.
// Minting the code is what reserves a key from the bunch, so this is where
// an approved request can find the room fully spoken for (NO_KEYS_AVAILABLE,
// catalogue copy) — distinct from CONFLICT, the request's own state.
export const POST = route({
  name: 'public/weekend-request/code',
  auth: 'public',
  params: z.object({ token: z.uuid() }),
  paramsError: { status: 404, message: 'Request not found' },
  handler: async ({ params }) => {
    const result = await callRpc(
      createAdminClient(),
      'generate_guest_weekend_code',
      { p_access_token: params.token }
    );
    if (!result.ok) {
      return rpcFail(result.error, {
        NOT_FOUND: 'Request not found',
        CONFLICT: 'This request is not approved for collection.',
      });
    }

    // A failed send never fails the request: the code is already shown on
    // the status page.
    notifyAfterResponse({
      type: 'CODE_ISSUED',
      requestId: result.data.request_id,
    });

    return respond.ok({
      request_id: result.data.request_id,
      code: result.data.code,
      code_expires_at: result.data.code_expires_at,
    });
  },
});
