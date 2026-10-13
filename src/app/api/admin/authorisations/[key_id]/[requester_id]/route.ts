import * as z from 'zod';

import { collectorForbidden } from '@/lib/admin/collector-errors';
import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { rpcFail } from '@/lib/http/rpc-errors';
import { callRpcVoid } from '@/lib/rpc/call-rpc';

// remove_collector is authoriser-aware, like nominate_collector: a Dean for
// their own faculty's keys, the CSO for Administration keys.
export const DELETE = route({
  name: 'admin/authorisations/[key_id]/[requester_id]',
  auth: 'user',
  roles: ['CSO', 'DEAN'],
  params: z.object({ key_id: z.uuid(), requester_id: z.uuid() }),
  paramsError: { status: 404, message: 'Authorisation not found' },
  handler: async ({ supabase, params }) => {
    const result = await callRpcVoid(supabase, 'remove_collector', {
      p_key_id: params.key_id,
      p_requester_id: params.requester_id,
    });

    if (!result.ok) {
      return rpcFail(result.error, {
        FORBIDDEN: collectorForbidden,
        // Raised both for an unknown key and for a requester not in a slot.
        NOT_FOUND: 'Authorisation not found',
      });
    }

    return respond.noContent();
  },
});
