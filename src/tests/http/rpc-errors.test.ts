// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import {
  byDetail,
  RPC_ERROR_HTTP,
  rpcErrorToHttp,
  rpcFail,
} from '@/lib/http/rpc-errors';
import { logger } from '@/lib/logger';
import { parseRpcErrorMessage, RPC_ERROR_KINDS } from '@/lib/rpc/call-rpc';

const SECRET = 'secret (current: PENDING_HOD)';

describe('RPC_ERROR_HTTP catalogue', () => {
  it('has a row for every RPC_ERROR_KINDS entry, and nothing else', () => {
    expect(Object.keys(RPC_ERROR_HTTP).sort()).toEqual(
      [...RPC_ERROR_KINDS].sort()
    );
  });

  it.each(RPC_ERROR_KINDS)('%s maps to a 4xx with copy', (kind) => {
    const row = RPC_ERROR_HTTP[kind];
    expect(row.status).toBeGreaterThanOrEqual(400);
    expect(row.status).toBeLessThan(500);
    expect(row.message.length).toBeGreaterThan(0);
  });

  it.each([
    ['NOT_AUTHENTICATED', 401, 'Unauthorized'],
    ['FORBIDDEN', 403, 'Forbidden'],
    ['NOT_AUTHORISED', 403, 'Not authorised for this key'],
    ['NOT_FOUND', 404, 'Not found'],
    ['EXPIRED_CODE', 404, 'Code has expired'],
    [
      'CONFLICT',
      409,
      "This action conflicts with the request's current state.",
    ],
  ] as const)('%s → %i %s', (kind, status, message) => {
    expect(RPC_ERROR_HTTP[kind]).toEqual({ status, message });
  });
});

describe('rpcErrorToHttp', () => {
  it.each(RPC_ERROR_KINDS)('never leaks detail for %s', (kind) => {
    const error = parseRpcErrorMessage(`${kind}: ${SECRET}`);
    expect(error.kind).toBe(kind);
    const http = rpcErrorToHttp(error);
    expect(http).toEqual(RPC_ERROR_HTTP[kind]);
    expect(http.message).not.toContain('secret');
    expect(http.message).not.toContain('PENDING_HOD');
  });

  it("does not leak detail for the plan's CONFLICT example", () => {
    const http = rpcErrorToHttp(
      parseRpcErrorMessage('CONFLICT: secret (current: PENDING_HOD)')
    );
    expect(http).toEqual({
      status: 409,
      message: "This action conflicts with the request's current state.",
    });
  });

  it('a string override replaces the message and keeps the status', () => {
    expect(
      rpcErrorToHttp(
        { kind: 'NOT_FOUND', detail: SECRET },
        { NOT_FOUND: 'Request not found' }
      )
    ).toEqual({ status: 404, message: 'Request not found' });
  });

  it('an HttpError override replaces both', () => {
    expect(
      rpcErrorToHttp(
        { kind: 'CONFLICT', detail: SECRET },
        { CONFLICT: { status: 422, message: 'Nope' } }
      )
    ).toEqual({ status: 422, message: 'Nope' });
  });

  it('a function override receives the detail', () => {
    const fn = vi.fn(() => 'Custom');
    expect(
      rpcErrorToHttp({ kind: 'CONFLICT', detail: SECRET }, { CONFLICT: fn })
    ).toEqual({ status: 409, message: 'Custom' });
    expect(fn).toHaveBeenCalledWith(SECRET);
  });

  it('a function override returning undefined falls back to the default', () => {
    expect(
      rpcErrorToHttp(
        { kind: 'CONFLICT', detail: SECRET },
        { CONFLICT: () => undefined }
      )
    ).toEqual(RPC_ERROR_HTTP.CONFLICT);
  });

  it('only the matching kind is overridden', () => {
    expect(
      rpcErrorToHttp(
        { kind: 'FORBIDDEN', detail: SECRET },
        { NOT_FOUND: 'Request not found' }
      )
    ).toEqual(RPC_ERROR_HTTP.FORBIDDEN);
  });

  it('INTERNAL is always the ref’d 500 and never shows detail', () => {
    const http = rpcErrorToHttp({
      kind: 'INTERNAL',
      detail: SECRET,
      ref: 'abc-123',
    });
    expect(http).toEqual({
      status: 500,
      message: 'Internal error. Ref: abc-123',
    });
  });

  it('INTERNAL without a ref mints and logs one', () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const http = rpcErrorToHttp({ kind: 'INTERNAL', detail: SECRET });
    expect(http.status).toBe(500);
    expect(http.message).toMatch(/^Internal error\. Ref: [0-9a-f-]{36}$/);
    expect(http.message).not.toContain('secret');
    expect(spy).toHaveBeenCalledWith(
      'RPC failed',
      expect.objectContaining({ err: SECRET })
    );
    spy.mockRestore();
  });
});

describe('byDetail', () => {
  const conflict = byDetail(
    [
      [/^three/, 'Three authorisation slots are already filled'],
      [/^requester/, { status: 409, message: 'Already authorised' }],
    ],
    'Fallback copy'
  );

  it('returns the first match', () => {
    expect(
      rpcErrorToHttp(
        { kind: 'CONFLICT', detail: 'three slots filled' },
        { CONFLICT: conflict }
      )
    ).toEqual({
      status: 409,
      message: 'Three authorisation slots are already filled',
    });
    expect(
      rpcErrorToHttp(
        { kind: 'CONFLICT', detail: 'requester already authorised' },
        { CONFLICT: conflict }
      )
    ).toEqual({ status: 409, message: 'Already authorised' });
  });

  it('uses the fallback when nothing matches', () => {
    expect(
      rpcErrorToHttp(
        { kind: 'CONFLICT', detail: SECRET },
        { CONFLICT: conflict }
      )
    ).toEqual({ status: 409, message: 'Fallback copy' });
  });

  it('without a fallback, defers to the catalogue', () => {
    expect(
      rpcErrorToHttp(
        { kind: 'CONFLICT', detail: SECRET },
        { CONFLICT: byDetail([[/^three/, 'x']]) }
      )
    ).toEqual(RPC_ERROR_HTTP.CONFLICT);
  });
});

describe('rpcFail', () => {
  it('returns the enveloped response', async () => {
    const res = rpcFail(
      { kind: 'NO_KEYS_AVAILABLE', detail: SECRET },
      { NOT_FOUND: 'unused' }
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      data: null,
      error: RPC_ERROR_HTTP.NO_KEYS_AVAILABLE.message,
      status: 409,
    });
  });
});
