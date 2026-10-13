import * as z from 'zod';

import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { rpcFail } from '@/lib/http/rpc-errors';
import { callRpc } from '@/lib/rpc/call-rpc';
import { createAdminClient } from '@/lib/supabase/admin';

// Unauthenticated guest analogue of requests/request-return: a 6-digit
// return code for the guest's own KEY_ISSUED request, keyed on the
// access_token. request_return_guest raises CONFLICT where the registered
// RPC raises NOT_ISSUED, hence the override.
export const POST = route({
  name: 'public/weekend-request/return-code',
  auth: 'public',
  params: z.object({ token: z.uuid() }),
  paramsError: { status: 404, message: 'Request not found.' },
  handler: async ({ params }) => {
    const result = await callRpc(createAdminClient(), 'request_return_guest', {
      p_access_token: params.token,
    });
    if (!result.ok) {
      return rpcFail(result.error, {
        NOT_FOUND: 'Request not found.',
        CONFLICT: 'Key is not currently issued.',
      });
    }

    return respond.ok({
      return_code: result.data.return_code,
      return_code_expires_at: result.data.return_code_expires_at,
    });
  },
});
