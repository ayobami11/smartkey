import { logger } from '@/lib/logger';
import type { RpcError, RpcResult } from '@/lib/rpc/call-rpc';

import type { AuthResult } from '@/lib/admin/revoke-user';

// Reinstating a deactivated user touches the same two systems as revoking
// one, which cannot share a transaction: the auth ban (GoTrue) and the
// profile + audit entry (Postgres, via the reinstate_user RPC). The order is
// chosen so a failure never leaves a DEACTIVATED profile whose auth account
// can sign in — a revoked user who is let back in without a record:
//
//   1. reinstate_user — status back to PENDING_ACTIVATION, units.hod_id and
//      USER_REINSTATED, atomically. The user is still banned, so this step on
//      its own changes nothing about who can sign in;
//   2. lift the ban;
//   3. if 2 fails, put the profile back with deactivate_user. The audit log
//      then reads USER_REINSTATED followed by USER_DEACTIVATED, which is what
//      happened; audit entries are immutable, so there is no "undo".
//
// The reverse order (lift the ban, then the RPC, re-ban on failure) has a
// worst case of a failed RPC plus a failed re-ban: DEACTIVATED in Postgres,
// free to sign in at GoTrue. The worst case here (RPC and compensation both
// fail) is PENDING_ACTIVATION but still banned — locked out, which is safe.

export type ReinstatePorts = {
  reinstate: (
    profileId: string
  ) => Promise<RpcResult<{ profile_id: string; status: string; role: string }>>;
  unban: (profileId: string) => Promise<AuthResult>;
  deactivate: (
    profileId: string
  ) => Promise<RpcResult<{ profile_id: string; status: string }>>;
};

export type ReinstateOutcome =
  | { ok: true; profileId: string; role: string; status: 'PENDING_ACTIVATION' }
  // The RPC refused or failed. Nothing changed.
  | { ok: false; reason: 'RPC_FAILED'; error: RpcError }
  // The ban could not be lifted. `restored` is true when deactivate_user put
  // the profile back; false means it is PENDING_ACTIVATION but still banned.
  | { ok: false; reason: 'UNBAN_FAILED'; ref: string; restored: boolean };

export const reinstateUser = async (
  profileId: string,
  ports: ReinstatePorts
): Promise<ReinstateOutcome> => {
  const result = await ports.reinstate(profileId);
  if (!result.ok)
    return { ok: false, reason: 'RPC_FAILED', error: result.error };

  const lifted = await ports.unban(profileId);
  if (lifted.ok) {
    return {
      ok: true,
      profileId,
      role: result.data.role,
      status: 'PENDING_ACTIVATION',
    };
  }

  const ref = crypto.randomUUID();
  const restored = await ports.deactivate(profileId);
  if (restored.ok) {
    logger.error(
      'reinstate: auth ban could not be lifted; the profile was deactivated again',
      { profileId, err: lifted.message, ref }
    );
  } else {
    logger.error(
      'reinstate: auth ban could not be lifted and deactivate_user failed; the user is PENDING_ACTIVATION but still banned',
      {
        profileId,
        err: lifted.message,
        rpcError: restored.error.detail,
        ref,
      }
    );
  }
  return { ok: false, reason: 'UNBAN_FAILED', ref, restored: restored.ok };
};
