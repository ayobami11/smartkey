import * as z from 'zod';

import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { byDetail, rpcFail } from '@/lib/http/rpc-errors';
import { callRpc } from '@/lib/rpc/call-rpc';

const bodySchema = z.object({
  request_id: z.uuid(),
});

// Clears a lapsed weekend request out of the authoriser's pending queue. The
// RPC re-validates the authoriser gate and that the date has actually passed,
// so a crafted request cannot dismiss another faculty's live one.
export const POST = route({
  name: 'requests/dismiss',
  auth: 'user',
  roles: ['DEAN', 'CSO'],
  body: bodySchema,
  handler: async ({ supabase, user, body }) => {
    const result = await callRpc(supabase, 'dismiss_expired_request', {
      p_request_id: body.request_id,
      p_actor_id: user.id,
    });
    if (!result.ok) {
      return rpcFail(result.error, {
        NOT_FOUND: 'Request not found',
        FORBIDDEN: 'This request is not in your faculty.',
        CONFLICT: byDetail(
          [
            [
              /^the requested date has not passed yet$/,
              'This request is still live — approve or decline it instead.',
            ],
          ],
          'This request can no longer be dismissed.'
        ),
      });
    }
    return respond.ok({
      request_id: result.data.request_id,
      status: result.data.status,
    });
  },
});
