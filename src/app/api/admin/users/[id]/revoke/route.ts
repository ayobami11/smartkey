import * as z from 'zod';

import { revokeUser, type RevokePorts } from '@/lib/admin/revoke-user';
import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { rpcFail } from '@/lib/http/rpc-errors';
import { callRpc } from '@/lib/rpc/call-rpc';
import { createAdminClient } from '@/lib/supabase/admin';

// ~100 years: effectively permanent. A ban rather than deleteUser keeps the
// profile row and all of its audit history.
const BAN_DURATION = '876000h';

export const PATCH = route({
  name: 'admin/users/[id]/revoke',
  auth: 'user',
  roles: ['CSO'],
  params: z.object({ id: z.uuid() }),
  paramsError: { status: 404, message: 'User not found' },
  handler: async ({ supabase, params }) => {
    const admin = createAdminClient();

    const ports: RevokePorts = {
      loadStatus: async (id) => {
        const { data } = await supabase
          .from('profiles')
          .select('status')
          .eq('id', id)
          .maybeSingle();
        return data?.status ?? null;
      },
      ban: async (id) => {
        const { error } = await admin.auth.admin.updateUserById(id, {
          ban_duration: BAN_DURATION,
        });
        return error ? { ok: false, message: error.message } : { ok: true };
      },
      unban: async (id) => {
        const { error } = await admin.auth.admin.updateUserById(id, {
          ban_duration: 'none',
        });
        return error ? { ok: false, message: error.message } : { ok: true };
      },
      // The CSO's own session: deactivate_user checks the actor is the CSO.
      deactivate: (id) =>
        callRpc(supabase, 'deactivate_user', { p_profile_id: id }),
    };

    const outcome = await revokeUser(params.id, ports);

    if (outcome.ok) {
      return respond.ok({
        profile_id: outcome.profileId,
        status: outcome.status,
      });
    }
    switch (outcome.reason) {
      case 'NOT_FOUND':
        return respond.fail(404, 'User not found');
      case 'ALREADY_DEACTIVATED':
        return respond.fail(409, 'User is already deactivated');
      case 'BAN_FAILED':
        return respond.fail(500, `Internal error. Ref: ${outcome.ref}`);
      case 'RPC_FAILED':
        return rpcFail(outcome.error, { NOT_FOUND: 'User not found' });
    }
  },
});
