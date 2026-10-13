import * as z from 'zod';

import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { rpcFail } from '@/lib/http/rpc-errors';
import { callRpc } from '@/lib/rpc/call-rpc';

const bodySchema = z.object({
  request_id: z.uuid(),
});

// Cancellable in any pre-collection state the requester owns: a weekday code
// (CODE_ISSUED), or a weekend request awaiting or holding approval
// (PENDING_HOD, APPROVED). The status change and the REQUEST_CANCELLED audit
// entry commit together in cancel_request; the requester is the session user.
export const POST = route({
  name: 'requests/cancel',
  auth: 'user',
  roles: ['REQUESTER'],
  body: bodySchema,
  handler: async ({ supabase, body }) => {
    const result = await callRpc(supabase, 'cancel_request', {
      p_request_id: body.request_id,
    });
    if (!result.ok) {
      return rpcFail(result.error, {
        CONFLICT: 'Request cannot be cancelled in its current state',
      });
    }
    return respond.ok({
      request_id: result.data.request_id,
      status: result.data.status,
    });
  },
});
