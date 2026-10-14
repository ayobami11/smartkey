import { logger } from '@/lib/logger';
import type { RpcError, RpcResult } from '@/lib/rpc/call-rpc';

import type { AuthResult } from '@/lib/admin/revoke-user';

// Provisioning a new user also spans GoTrue and Postgres. provision_user
// needs the auth.users row to exist (it looks the id up by email), so the
// auth account has to come first: generateLink({ type: 'invite' }) creates it
// and mints the activation token in one call. The order is:
//
//   1. create the auth account and its invite link;
//   2. provision_user — profile, units.hod_id and USER_PROVISIONED, atomically;
//   3. if 2 fails, delete the auth account from 1, so no invited account is
//      left without a profile (it could not sign in to anything, and the next
//      attempt for that email would trip over it);
//   4. only then send the email, so nobody is ever mailed a link to an
//      account that has no profile.
//
// Step 3 is skipped for DUPLICATE_PROFILE: that means a profile already owns
// this auth account (a concurrent provisioning of the same email won), and
// profiles.id cascades from auth.users, so deleting it would delete that
// user too.

export type InviteLink = {
  userId: string;
  hashedToken: string;
  verificationType: string;
};

export type ProvisionPorts = {
  createInvite: () => Promise<
    { ok: true; link: InviteLink } | { ok: false; message: string }
  >;
  provision: () => Promise<RpcResult<{ profile_id: string }>>;
  deleteAuthUser: (userId: string) => Promise<AuthResult>;
  /** Best effort: a failure is logged by the caller and never fails the call. */
  sendInvite: (link: InviteLink) => Promise<void>;
};

export type ProvisionOutcome =
  | { ok: true; profileId: string }
  | { ok: false; reason: 'INVITE_FAILED'; ref: string }
  // `authUserDeleted` is false when the delete was skipped (DUPLICATE_PROFILE)
  // or itself failed, which is logged.
  | {
      ok: false;
      reason: 'RPC_FAILED';
      error: RpcError;
      authUserDeleted: boolean;
    };

export const provisionNewUser = async (
  ports: ProvisionPorts
): Promise<ProvisionOutcome> => {
  const invite = await ports.createInvite();
  if (!invite.ok) {
    const ref = crypto.randomUUID();
    logger.error('provision_user: generateLink failed', {
      err: invite.message,
      ref,
    });
    return { ok: false, reason: 'INVITE_FAILED', ref };
  }

  const result = await ports.provision();
  if (!result.ok) {
    let authUserDeleted = false;
    if (result.error.kind !== 'DUPLICATE_PROFILE') {
      const deleted = await ports.deleteAuthUser(invite.link.userId);
      authUserDeleted = deleted.ok;
      if (!deleted.ok) {
        logger.error(
          'provision_user failed and the new auth account could not be deleted; it has no profile',
          {
            userId: invite.link.userId,
            err: deleted.message,
            rpcError: result.error.detail,
          }
        );
      }
    }
    return {
      ok: false,
      reason: 'RPC_FAILED',
      error: result.error,
      authUserDeleted,
    };
  }

  await ports.sendInvite(invite.link);
  return { ok: true, profileId: result.data.profile_id };
};
