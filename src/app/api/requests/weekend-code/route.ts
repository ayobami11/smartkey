import * as z from 'zod';

import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { rpcFail } from '@/lib/http/rpc-errors';
import { notifyAfterResponse } from '@/lib/notifications/notify';
import { callRpc } from '@/lib/rpc/call-rpc';

const bodySchema = z.object({
  request_id: z.uuid(),
});

// Mints the on-the-day collection code for an APPROVED weekend request.
// Minting the code is what reserves a key from the bunch, so this is where an
// approved request can find the room fully spoken for (NO_KEYS_AVAILABLE,
// catalogue copy) — distinct from CONFLICT, which is about the request's own
// state.
export const POST = route({
  name: 'requests/weekend-code',
  auth: 'user',
  roles: ['REQUESTER'],
  body: bodySchema,
  handler: async ({ supabase, user, body }) => {
    const result = await callRpc(supabase, 'generate_weekend_code', {
      p_request_id: body.request_id,
      p_requester_id: user.id,
    });
    if (!result.ok) {
      return rpcFail(result.error, {
        NOT_AUTHENTICATED: 'Not authenticated',
        NOT_FOUND: 'Request not found',
        FORBIDDEN: 'This is not your request',
        CONFLICT: 'This request is not awaiting collection.',
      });
    }

    // A failed send never fails the request: the code is already shown in-app.
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
