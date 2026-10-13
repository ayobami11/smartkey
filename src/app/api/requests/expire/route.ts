import * as z from 'zod';

import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { rpcFail } from '@/lib/http/rpc-errors';
import { callRpc } from '@/lib/rpc/call-rpc';

const bodySchema = z.object({
  request_id: z.uuid(),
});

// Fired by the UI when a collection code's countdown reaches 0. No role gate:
// expire_request itself refuses anyone but the request's owner. Idempotent —
// a request that already moved on comes back with its current status.
export const POST = route({
  name: 'requests/expire',
  auth: 'user',
  body: bodySchema,
  handler: async ({ supabase, user, body }) => {
    const result = await callRpc(supabase, 'expire_request', {
      p_request_id: body.request_id,
      p_requester_id: user.id,
    });
    if (!result.ok) {
      return rpcFail(result.error, {
        NOT_AUTHENTICATED: 'Not authenticated',
        NOT_FOUND: 'Request not found',
        FORBIDDEN: 'This is not your request',
      });
    }
    return respond.ok({
      request_id: result.data.request_id,
      status: result.data.status,
    });
  },
});
