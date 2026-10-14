import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type InviteLink,
  provisionNewUser,
  type ProvisionPorts,
} from '@/lib/admin/provision-new-user';
import { logger } from '@/lib/logger';
import type { RpcError } from '@/lib/rpc/call-rpc';

const PROFILE_ID = '11111111-1111-4111-8111-111111111111';
const LINK: InviteLink = {
  userId: PROFILE_ID,
  hashedToken: 'hashed',
  verificationType: 'invite',
};

const makePorts = (
  options: {
    inviteFails?: boolean;
    rpcError?: RpcError;
    deleteFails?: boolean;
  } = {}
) => {
  const calls: string[] = [];
  const ports: ProvisionPorts = {
    createInvite: vi.fn(async () => {
      calls.push('createInvite');
      return options.inviteFails
        ? { ok: false as const, message: 'gotrue down' }
        : { ok: true as const, link: LINK };
    }),
    provision: vi.fn(async () => {
      calls.push('provision');
      return options.rpcError
        ? { ok: false as const, error: options.rpcError }
        : { ok: true as const, data: { profile_id: PROFILE_ID } };
    }),
    deleteAuthUser: vi.fn(async () => {
      calls.push('deleteAuthUser');
      return options.deleteFails
        ? { ok: false as const, message: 'gotrue down' }
        : { ok: true as const };
    }),
    sendInvite: vi.fn(async () => {
      calls.push('sendInvite');
    }),
  };
  return { ports, calls };
};

beforeEach(() => {
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);
});

describe('provisionNewUser', () => {
  it('creates the auth account, provisions, then emails', async () => {
    const { ports, calls } = makePorts();
    expect(await provisionNewUser(ports)).toEqual({
      ok: true,
      profileId: PROFILE_ID,
    });
    expect(calls).toEqual(['createInvite', 'provision', 'sendInvite']);
    expect(ports.sendInvite).toHaveBeenCalledWith(LINK);
  });

  it('stops before provisioning when the invite cannot be created', async () => {
    const { ports, calls } = makePorts({ inviteFails: true });
    const outcome = await provisionNewUser(ports);
    expect(outcome).toMatchObject({ ok: false, reason: 'INVITE_FAILED' });
    expect(
      outcome.ok === false && 'ref' in outcome && outcome.ref
    ).toBeTruthy();
    expect(calls).toEqual(['createInvite']);
  });

  it('deletes the new auth account, and sends nothing, when provision_user fails', async () => {
    const error: RpcError = { kind: 'INTERNAL', detail: 'boom', ref: 'r1' };
    const { ports, calls } = makePorts({ rpcError: error });
    expect(await provisionNewUser(ports)).toEqual({
      ok: false,
      reason: 'RPC_FAILED',
      error,
      authUserDeleted: true,
    });
    expect(calls).toEqual(['createInvite', 'provision', 'deleteAuthUser']);
    expect(ports.deleteAuthUser).toHaveBeenCalledWith(PROFILE_ID);
  });

  it('keeps the auth account on DUPLICATE_PROFILE: a profile owns it', async () => {
    const error: RpcError = {
      kind: 'DUPLICATE_PROFILE',
      detail: 'profile already exists for this user',
    };
    const { ports, calls } = makePorts({ rpcError: error });
    expect(await provisionNewUser(ports)).toEqual({
      ok: false,
      reason: 'RPC_FAILED',
      error,
      authUserDeleted: false,
    });
    expect(calls).toEqual(['createInvite', 'provision']);
  });

  it('reports and logs an auth account it could not delete', async () => {
    const error: RpcError = { kind: 'FORBIDDEN', detail: 'only CSO' };
    const { ports, calls } = makePorts({ rpcError: error, deleteFails: true });
    expect(await provisionNewUser(ports)).toMatchObject({
      ok: false,
      reason: 'RPC_FAILED',
      authUserDeleted: false,
    });
    expect(calls).toEqual(['createInvite', 'provision', 'deleteAuthUser']);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('could not be deleted'),
      expect.objectContaining({ userId: PROFILE_ID })
    );
  });
});
