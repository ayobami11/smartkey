import * as z from 'zod';

import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { rpcFail } from '@/lib/http/rpc-errors';
import { callRpc } from '@/lib/rpc/call-rpc';

const bodySchema = z.object({
  key_id: z.uuid(),
  note: z.string().min(1),
});

// Retiring the key, logging the MISSING_KEY/HIGH incident and writing the
// KEY_MARKED_LOST audit entry commit together in mark_key_lost. The CSO is the
// session user.
export const POST = route({
  name: 'keys/mark-lost',
  auth: 'user',
  roles: ['CSO'],
  body: bodySchema,
  handler: async ({ supabase, body }) => {
    const result = await callRpc(supabase, 'mark_key_lost', {
      p_key_id: body.key_id,
      p_note: body.note,
    });

    if (!result.ok) {
      return rpcFail(result.error, {
        NOT_FOUND: 'Key not found',
        CONFLICT: 'Key is already retired',
        // A whitespace-only note passes the schema but not the RPC.
        VALIDATION: 'Invalid request body',
      });
    }

    return respond.ok({
      key_id: result.data.key_id,
      incident_id: result.data.incident_id,
    });
  },
});
