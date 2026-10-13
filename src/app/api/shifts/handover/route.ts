import * as z from 'zod';

import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { rpcFail } from '@/lib/http/rpc-errors';
import { callRpc } from '@/lib/rpc/call-rpc';

const bodySchema = z.object({
  outgoing_shift_id: z.uuid(),
  key_ids: z.array(z.uuid()),
  bulk: z.boolean(),
});

export const POST = route({
  name: 'shifts/handover',
  auth: 'user',
  roles: ['VERIFIER'],
  body: bodySchema,
  handler: async ({ supabase, body }) => {
    const result = await callRpc(supabase, 'acknowledge_shift_handover', {
      p_outgoing_shift_id: body.outgoing_shift_id,
      p_key_ids: body.key_ids,
      p_bulk: body.bulk,
    });

    if (!result.ok) {
      return rpcFail(result.error, {
        NOT_AUTHENTICATED: 'Not authenticated',
        CONFLICT: 'Handover already completed for this shift',
      });
    }

    const { handover_id, acknowledged_count } = result.data;
    return respond.ok({ handover_id, acknowledged_count });
  },
});
