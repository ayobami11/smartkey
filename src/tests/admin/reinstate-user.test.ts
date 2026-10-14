import { beforeEach, describe, expect, it, vi } from 'vitest';

import { reinstateUser, type ReinstatePorts } from '@/lib/admin/reinstate-user';
import { logger } from '@/lib/logger';
import type { RpcError } from '@/lib/rpc/call-rpc';

const ID = '11111111-1111-4111-8111-111111111111';

const makePorts = (
  options: {
    rpcError?: RpcError;
    unbanFails?: boolean;
    deactivateError?: RpcError;
  } = {}
) => {
  const calls: string[] = [];
  const ports: ReinstatePorts = {
    reinstate: vi.fn(async (id: string) => {
      calls.push('reinstate');
      return options.rpcError
        ? { ok: false as const, error: options.rpcError }
        : {
            ok: true as const,
            data: {
              profile_id: id,
              status: 'PENDING_ACTIVATION',
              role: 'DEAN',
            },
          };
    }),
    unban: vi.fn(async () => {
      calls.push('unban');
      return options.unbanFails
        ? { ok: false as const, message: 'gotrue down' }
        : { ok: true as const };
    }),
    deactivate: vi.fn(async (id: string) => {
      calls.push('deactivate');
      return options.deactivateError
        ? { ok: false as const, error: options.deactivateError }
        : {
            ok: true as const,
            data: { profile_id: id, status: 'DEACTIVATED' },
          };
    }),
  };
  return { ports, calls };
};

beforeEach(() => {
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);
});

describe('reinstateUser', () => {
  it('reinstates first, then lifts the ban', async () => {
    const { ports, calls } = makePorts();
    expect(await reinstateUser(ID, ports)).toEqual({
      ok: true,
      profileId: ID,
      role: 'DEAN',
      status: 'PENDING_ACTIVATION',
    });
    expect(calls).toEqual(['reinstate', 'unban']);
  });

  it('leaves the ban in place when reinstate_user refuses', async () => {
    const error: RpcError = {
      kind: 'CONFLICT',
      detail: 'user is not deactivated',
    };
    const { ports, calls } = makePorts({ rpcError: error });
    expect(await reinstateUser(ID, ports)).toEqual({
      ok: false,
      reason: 'RPC_FAILED',
      error,
    });
    expect(calls).toEqual(['reinstate']);
  });

  it('deactivates the profile again when the ban cannot be lifted', async () => {
    const { ports, calls } = makePorts({ unbanFails: true });
    const outcome = await reinstateUser(ID, ports);
    expect(outcome).toMatchObject({
      ok: false,
      reason: 'UNBAN_FAILED',
      restored: true,
    });
    expect(
      outcome.ok === false && 'ref' in outcome && outcome.ref
    ).toBeTruthy();
    expect(calls).toEqual(['reinstate', 'unban', 'deactivate']);
  });

  it('reports when the compensation failed too: pending, but still banned', async () => {
    const { ports } = makePorts({
      unbanFails: true,
      deactivateError: { kind: 'INTERNAL', detail: 'boom', ref: 'r1' },
    });
    expect(await reinstateUser(ID, ports)).toMatchObject({
      ok: false,
      reason: 'UNBAN_FAILED',
      restored: false,
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('still banned'),
      expect.objectContaining({ profileId: ID })
    );
  });
});
