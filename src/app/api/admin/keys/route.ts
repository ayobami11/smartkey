import * as z from 'zod';

import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';

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

// Postgres unique_violation, raised here by keys.code.
const UNIQUE_VIOLATION = '23505';

// Known follow-up: creating a key writes no audit entry. It is a single-row
// insert under the keys RLS policy (CSO write), not an RPC.
export const POST = route({
  name: 'admin/keys',
  auth: 'user',
  roles: ['CSO'],
  body: bodySchema,
  handler: async ({ supabase, body }) => {
    const { code, zone, room_name, unit_id, key_count } = body;

    const { data: key, error: insertError } = await supabase
      .from('keys')
      .insert({
        code,
        zone,
        room_name,
        unit_id,
        key_count,
        status: 'AVAILABLE',
      })
      .select('id')
      .single();

    if (insertError) {
      if (insertError.code === UNIQUE_VIOLATION) {
        return respond.fail(409, `Key code "${code}" is already in use.`);
      }
      return respond.internal('create-key: insert failed', {
        err: insertError.message,
      });
    }

    return respond.ok({ key_id: key.id }, 201);
  },
});
