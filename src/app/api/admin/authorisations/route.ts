import * as z from 'zod';

import { collectorForbidden } from '@/lib/admin/collector-errors';
import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { byDetail, rpcFail } from '@/lib/http/rpc-errors';
import { callRpc } from '@/lib/rpc/call-rpc';

const bodySchema = z.object({
  key_id: z.uuid(),
  requester_id: z.uuid(),
});

// nominate_collector is authoriser-aware: a Dean for their own faculty's
// keys, the CSO for Administration keys. The role list here is defence in
// depth; the RPC decides which keys each may touch.
export const POST = route({
  name: 'admin/authorisations',
  auth: 'user',
  roles: ['CSO', 'DEAN'],
  body: bodySchema,
  handler: async ({ supabase, body }) => {
    const { key_id, requester_id } = body;

    const result = await callRpc(supabase, 'nominate_collector', {
      p_key_id: key_id,
      p_requester_id: requester_id,
    });

    if (!result.ok) {
      return rpcFail(result.error, {
        NOT_FOUND: 'Key not found',
        FORBIDDEN: collectorForbidden,
        CONFLICT: byDetail([
          [
            /^three authorisation slots are already filled$/,
            'Three authorisation slots are already filled',
          ],
          [
            /^requester is already authorised for this key$/,
            'Requester is already authorised for this key',
          ],
        ]),
      });
    }

    return respond.ok(
      {
        authorisation_id: `${key_id}:${requester_id}`,
        slot_number: result.data.slot_number,
      },
      201
    );
  },
});
