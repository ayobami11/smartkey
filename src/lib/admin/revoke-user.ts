import { logger } from '@/lib/logger';
import type { RpcError, RpcResult } from '@/lib/rpc/call-rpc';

// Revoking a user touches two systems that cannot share a transaction: the
// auth ban (GoTrue) and the profile + audit entry (Postgres, via the
// deactivate_user RPC). The order is chosen so a failure never leaves a
// "deactivated" user who can still sign in:
//
//   1. ban — the only thing that actually locks the user out, and reversible;
//   2. deactivate_user — status, units.hod_id and USER_DEACTIVATED, atomically;
//   3. if 2 fails, lift the ban, so the user is back where they started.
//
// The reverse order would need to undo an audit entry on a failed ban, and
// audit entries are immutable.

export type ProfileStatus = 'PENDING_ACTIVATION' | 'ACTIVE' | 'DEACTIVATED';

export type AuthResult = { ok: true } | { ok: false; message: string };

export type RevokePorts = {
  /** The target's current status, or null when there is no such profile. */
  loadStatus: (profileId: string) => Promise<ProfileStatus | null>;
  ban: (profileId: string) => Promise<AuthResult>;
  unban: (profileId: string) => Promise<AuthResult>;
  deactivate: (
    profileId: string
  ) => Promise<RpcResult<{ profile_id: string; status: string }>>;
};

export type RevokeOutcome =
  | { ok: true; profileId: string; status: 'DEACTIVATED' }
  | { ok: false; reason: 'NOT_FOUND' | 'ALREADY_DEACTIVATED' }
  | { ok: false; reason: 'BAN_FAILED'; ref: string }
  // The RPC refused or failed. `banLifted` is false only when lifting the ban
  // itself failed: the user is then banned but still ACTIVE, which is logged.
  | { ok: false; reason: 'RPC_FAILED'; error: RpcError; banLifted: boolean };

export const revokeUser = async (
  profileId: string,
  ports: RevokePorts
): Promise<RevokeOutcome> => {
  // Checked before banning: banning an unknown or already-deactivated user and
  // then lifting the ban when the RPC refuses would un-ban a revoked account.
  const status = await ports.loadStatus(profileId);
  if (status === null) return { ok: false, reason: 'NOT_FOUND' };
  if (status === 'DEACTIVATED') {
    return { ok: false, reason: 'ALREADY_DEACTIVATED' };
  }

  const banned = await ports.ban(profileId);
  if (!banned.ok) {
    const ref = crypto.randomUUID();
    logger.error('revoke: auth ban failed', {
      profileId,
      err: banned.message,
      ref,
    });
    return { ok: false, reason: 'BAN_FAILED', ref };
  }

  const result = await ports.deactivate(profileId);
  if (result.ok) {
    return { ok: true, profileId, status: 'DEACTIVATED' };
  }

  // CONFLICT means someone else deactivated the user between the status read
  // and the RPC. The ban is then correct and must stay.
  if (result.error.kind === 'CONFLICT') {
    return { ok: false, reason: 'ALREADY_DEACTIVATED' };
  }

  const lifted = await ports.unban(profileId);
  if (!lifted.ok) {
    logger.error(
      'revoke: deactivate_user failed and the auth ban could not be lifted; the user is banned but still ACTIVE',
      { profileId, err: lifted.message, rpcError: result.error.detail }
    );
  }
  return {
    ok: false,
    reason: 'RPC_FAILED',
    error: result.error,
    banLifted: lifted.ok,
  };
};
