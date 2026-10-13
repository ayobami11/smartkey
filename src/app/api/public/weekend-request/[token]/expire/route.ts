import * as z from 'zod';

import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { rpcFail } from '@/lib/http/rpc-errors';
import { callRpc } from '@/lib/rpc/call-rpc';
import { createAdminClient } from '@/lib/supabase/admin';

// Unauthenticated. Fired automatically by the status page when a collection
// code's countdown reaches 0. Flips a genuinely-expired CODE_ISSUED guest
// request to EXPIRED (or back to APPROVED on the requested day). Idempotent —
// returns the current status with no error if the request already moved on.
export const POST = route({
  name: 'public/weekend-request/expire',
  auth: 'public',
  params: z.object({ token: z.uuid() }),
  paramsError: { status: 404, message: 'Request not found' },
  handler: async ({ params }) => {
    const result = await callRpc(createAdminClient(), 'expire_guest_request', {
      p_access_token: params.token,
    });
    if (!result.ok) {
      return rpcFail(result.error, {
        NOT_FOUND: 'Request not found',
        NOT_EXPIRED: 'The code has not expired yet.',
      });
    }

    return respond.ok({
      request_id: result.data.request_id,
      status: result.data.status,
    });
  },
});
