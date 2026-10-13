import { describe, expect, it, vi } from 'vitest';

import {
  type ProfileStatus,
  revokeUser,
  type RevokePorts,
} from '@/lib/admin/revoke-user';
import type { RpcError } from '@/lib/rpc/call-rpc';

const ID = '11111111-1111-4111-8111-111111111111';

const makePorts = (
  options: {
    status?: ProfileStatus | null;
    banFails?: boolean;
    unbanFails?: boolean;
    rpcError?: RpcError;
  } = {}
) => {
  const calls: string[] = [];
  const ports: RevokePorts = {
    loadStatus: vi.fn(async () => {
      calls.push('loadStatus');
      return options.status === undefined ? 'ACTIVE' : options.status;
    }),
    ban: vi.fn(async () => {
      calls.push('ban');
      return options.banFails
        ? { ok: false as const, message: 'gotrue down' }
        : { ok: true as const };
    }),
    unban: vi.fn(async () => {
      calls.push('unban');
      return options.unbanFails
        ? { ok: false as const, message: 'gotrue down' }
        : { ok: true as const };
    }),
    deactivate: vi.fn(async (id: string) => {
      calls.push('deactivate');
      return options.rpcError
        ? { ok: false as const, error: options.rpcError }
        : {
            ok: true as const,
            data: { profile_id: id, status: 'DEACTIVATED' },
          };
    }),
  };
  return { ports, calls };
};

describe('revokeUser', () => {
  it('bans first, then deactivates', async () => {
    const { ports, calls } = makePorts();
    const outcome = await revokeUser(ID, ports);
    expect(outcome).toEqual({
      ok: true,
      profileId: ID,
      status: 'DEACTIVATED',
    });
    expect(calls).toEqual(['loadStatus', 'ban', 'deactivate']);
  });

  it('reports an unknown user without banning anyone', async () => {
    const { ports, calls } = makePorts({ status: null });
    expect(await revokeUser(ID, ports)).toEqual({
      ok: false,
      reason: 'NOT_FOUND',
    });
    expect(calls).toEqual(['loadStatus']);
  });

  it('refuses an already-deactivated user without touching the ban', async () => {
    const { ports, calls } = makePorts({ status: 'DEACTIVATED' });
    expect(await revokeUser(ID, ports)).toEqual({
      ok: false,
      reason: 'ALREADY_DEACTIVATED',
    });
    expect(calls).toEqual(['loadStatus']);
  });

  it('fails without deactivating when the ban fails', async () => {
    const { ports, calls } = makePorts({ banFails: true });
    const outcome = await revokeUser(ID, ports);
    expect(outcome).toMatchObject({ ok: false, reason: 'BAN_FAILED' });
    expect(
      outcome.ok === false && 'ref' in outcome && outcome.ref
    ).toBeTruthy();
    expect(calls).toEqual(['loadStatus', 'ban']);
  });

  it('lifts the ban when deactivate_user fails', async () => {
    const error: RpcError = { kind: 'INTERNAL', detail: 'boom', ref: 'r1' };
    const { ports, calls } = makePorts({ rpcError: error });
    expect(await revokeUser(ID, ports)).toEqual({
      ok: false,
      reason: 'RPC_FAILED',
      error,
      banLifted: true,
    });
    expect(calls).toEqual(['loadStatus', 'ban', 'deactivate', 'unban']);
  });

  it('reports when the ban could not be lifted after a failure', async () => {
    const error: RpcError = { kind: 'FORBIDDEN', detail: 'only the CSO' };
    const { ports } = makePorts({ rpcError: error, unbanFails: true });
    expect(await revokeUser(ID, ports)).toEqual({
      ok: false,
      reason: 'RPC_FAILED',
      error,
      banLifted: false,
    });
  });

  it('keeps the ban when a concurrent revoke won the race', async () => {
    const { ports, calls } = makePorts({
      rpcError: { kind: 'CONFLICT', detail: 'user is already deactivated' },
    });
    expect(await revokeUser(ID, ports)).toEqual({
      ok: false,
      reason: 'ALREADY_DEACTIVATED',
    });
    expect(calls).toEqual(['loadStatus', 'ban', 'deactivate']);
  });
});
