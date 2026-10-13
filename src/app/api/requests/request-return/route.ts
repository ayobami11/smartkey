import * as z from 'zod';

import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { rpcFail } from '@/lib/http/rpc-errors';
import { callRpc } from '@/lib/rpc/call-rpc';

const bodySchema = z.object({
  request_id: z.uuid(),
});

// Generates a 6-digit return code for one of the caller's own issued keys.
// The request stays KEY_ISSUED; the code and its audit entry commit together
// in request_return.
export const POST = route({
  name: 'requests/request-return',
  auth: 'user',
  roles: ['REQUESTER'],
  body: bodySchema,
  handler: async ({ supabase, user, body }) => {
    const result = await callRpc(supabase, 'request_return', {
      p_request_id: body.request_id,
      p_requester_id: user.id,
    });
    if (!result.ok) {
      return rpcFail(result.error, {
        NOT_AUTHENTICATED: 'Not authenticated',
        NOT_FOUND: 'Request not found',
        FORBIDDEN: 'This is not your request',
        NOT_ISSUED: 'This key is not currently issued to you',
      });
    }
    return respond.ok({
      request_id: result.data.request_id,
      return_code: result.data.return_code,
      return_code_expires_at: result.data.return_code_expires_at,
    });
  },
});
