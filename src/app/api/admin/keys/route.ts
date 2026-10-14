import * as z from 'zod';

import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { byDetail, rpcFail } from '@/lib/http/rpc-errors';
import { callRpc } from '@/lib/rpc/call-rpc';

const bodySchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .regex(/^[A-Z0-9]+-\d+$/),
  zone: z.enum(['NEW_SENATE', 'OLD_SENATE']),
  room_name: z.string().trim().min(1),
  unit_id: z.uuid(),
  key_count: z.coerce.number().int().min(1).max(20).default(1),
});

// create_key inserts the key and writes KEY_CREATED in one transaction, with
// the CSO's own session (the RPC checks the actor). The keys_insert_cso RLS
// policy is gone, so this is the only way a key is created.
export const POST = route({
  name: 'admin/keys',
  auth: 'user',
  roles: ['CSO'],
  body: bodySchema,
  handler: async ({ supabase, body }) => {
    const { code, zone, room_name, unit_id, key_count } = body;

    const result = await callRpc(supabase, 'create_key', {
      p_code: code,
      p_zone: zone,
      p_room_name: room_name,
      p_unit_id: unit_id,
      p_key_count: key_count,
    });

    if (!result.ok) {
      return rpcFail(result.error, {
        CONFLICT: `Key code "${code}" is already in use.`,
        VALIDATION: byDetail([[/^unit not found/, 'Unit not found']]),
      });
    }

    return respond.ok({ key_id: result.data.key_id }, 201);
  },
});
