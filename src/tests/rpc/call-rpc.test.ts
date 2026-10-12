import { describe, expect, it } from 'vitest';

import {
  callRpc,
  parseRpcErrorMessage,
  type RpcClient,
} from '@/lib/rpc/call-rpc';

const stubClient = (response: {
  data: unknown;
  error: { message: string } | null;
}) => ({ rpc: async () => response }) as unknown as RpcClient;

describe('parseRpcErrorMessage', () => {
  it('keeps the whole detail even when it contains ": "', () => {
    expect(
      parseRpcErrorMessage(
        'CONFLICT: request is not in PENDING_HOD state (current: APPROVED)'
      )
    ).toEqual({
      kind: 'CONFLICT',
      detail: 'request is not in PENDING_HOD state (current: APPROVED)',
    });
  });

  it('matches the prefix exactly, not a substring', () => {
    expect(
      parseRpcErrorMessage('something mentions FORBIDDEN: in passing').kind
    ).toBe('INTERNAL');
  });

  it('treats an unknown prefix as INTERNAL', () => {
    expect(parseRpcErrorMessage('WAT: unexpected').kind).toBe('INTERNAL');
  });
});

describe('callRpc', () => {
  it('unwraps a set-returning result to its first row', async () => {
    const result = await callRpc(
      stubClient({
        data: [{ request_id: 'r1', decision_id: 'd1' }],
        error: null,
      }),
      'decline_weekend',
      { p_request_id: 'r1', p_hod_id: 'a1' }
    );
    expect(result).toEqual({
      ok: true,
      data: { request_id: 'r1', decision_id: 'd1' },
    });
  });

  it('turns an empty result into INTERNAL with a ref', async () => {
    const result = await callRpc(
      stubClient({ data: [], error: null }),
      'decline_weekend',
      { p_request_id: 'r1', p_hod_id: 'a1' }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('INTERNAL');
      expect(result.error.ref).toEqual(expect.any(String));
    }
  });

  it('returns a known kind without a ref', async () => {
    const result = await callRpc(
      stubClient({
        data: null,
        error: { message: 'NO_KEYS_AVAILABLE: every key is out (2 of 2)' },
      }),
      'decline_weekend',
      { p_request_id: 'r1', p_hod_id: 'a1' }
    );
    expect(result).toEqual({
      ok: false,
      error: { kind: 'NO_KEYS_AVAILABLE', detail: 'every key is out (2 of 2)' },
    });
  });

  it('gives an unrecognised failure a ref', async () => {
    const result = await callRpc(
      stubClient({ data: null, error: { message: 'connection reset' } }),
      'decline_weekend',
      { p_request_id: 'r1', p_hod_id: 'a1' }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('INTERNAL');
      expect(result.error.ref).toEqual(expect.any(String));
    }
  });
});
