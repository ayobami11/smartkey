import * as z from 'zod';

import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { byDetail, rpcFail } from '@/lib/http/rpc-errors';
import { callRpc } from '@/lib/rpc/call-rpc';

const bodySchema = z.object({
  full_name: z.string().trim().min(1),
  unit_id: z.uuid().optional(),
});

// CSO-only: edit an existing user's name and, for departmental roles (Dean,
// REQUESTER), their unit. Email is immutable here — it is the auth identity
// and chain-of-trust anchor — and role cannot change. update_user_profile
// validates the move, keeps units.hod_id in step for a Dean, and writes
// USER_UPDATED (changed fields only) in one transaction.
export const PATCH = route({
  name: 'admin/users/[id]',
  auth: 'user',
  roles: ['CSO'],
  params: z.object({ id: z.uuid() }),
  paramsError: { status: 404, message: 'User not found' },
  body: bodySchema,
  handler: async ({ supabase, params, body }) => {
    const result = await callRpc(supabase, 'update_user_profile', {
      p_profile_id: params.id,
      p_full_name: body.full_name,
      p_unit_id: body.unit_id,
    });
    if (!result.ok) {
      return rpcFail(result.error, {
        NOT_FOUND: 'User not found',
        CONFLICT: 'That unit already has a Dean',
        VALIDATION: byDetail([
          [/^unit is required/, 'Unit is required for this role'],
          [/^unit not found$/, 'Unit not found'],
          [/^full_name/, 'Name is required'],
        ]),
      });
    }
    return respond.ok({
      profile_id: result.data.profile_id,
      full_name: result.data.full_name,
      unit_id: result.data.unit_id,
    });
  },
});
