import { describe, expect, it } from 'vitest';

import {
  callRpc,
  callRpcVoid,
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

  it('parses a bare kind with no detail', () => {
    expect(parseRpcErrorMessage('NOT_AUTHENTICATED')).toEqual({
      kind: 'NOT_AUTHENTICATED',
      detail: '',
    });
  });

  it('still treats an unknown bare word as INTERNAL', () => {
    expect(parseRpcErrorMessage('BOOM').kind).toBe('INTERNAL');
  });
});

describe('callRpcVoid', () => {
  it('treats a null result as success', async () => {
    const result = await callRpcVoid(
      stubClient({ data: null, error: null }),
      'remove_collector',
      { p_key_id: 'k1', p_requester_id: 'r1' }
    );
    expect(result).toEqual({ ok: true, data: null });
  });

  it('parses a bare kind the same way as callRpc', async () => {
    const result = await callRpcVoid(
      stubClient({ data: null, error: { message: 'NOT_AUTHENTICATED' } }),
      'remove_collector',
      { p_key_id: 'k1', p_requester_id: 'r1' }
    );
    expect(result).toEqual({
      ok: false,
      error: { kind: 'NOT_AUTHENTICATED', detail: '' },
    });
  });

  it('gives an unrecognised failure a ref', async () => {
    const result = await callRpcVoid(
      stubClient({ data: null, error: { message: 'connection reset' } }),
      'update_risk_config',
      { p_rules: [], p_medium_min: 4, p_high_min: 7 }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('INTERNAL');
      expect(result.error.ref).toEqual(expect.any(String));
    }
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
