import { describe, expect, it, vi } from 'vitest';

import {
  decideWeekend,
  type DecisionContext,
  type WeekendDecisionPorts,
} from '@/lib/requests/decide-weekend';
import type { RpcError } from '@/lib/rpc/call-rpc';

const BASE = 'https://abc.supabase.co/storage/v1/object/public';
const DEAN_ID = '11111111-1111-1111-1111-111111111111';
const CSO_ID = '22222222-2222-2222-2222-222222222222';
const REQUESTER_ID = '33333333-3333-3333-3333-333333333333';
const REQUEST_ID = '44444444-4444-4444-4444-444444444444';

const LETTER = `${BASE}/weekend-letters/${REQUESTER_ID}/letter.png`;
const STAMP = `${BASE}/weekend-letters/${REQUESTER_ID}/stamp.png`;
const SIG_REF = `${BASE}/hod-signatures/${DEAN_ID}/signature.png`;
const STAMP_REF = `${BASE}/hod-signatures/${DEAN_ID}/stamp.png`;

const dean = {
  id: DEAN_ID,
  role: 'DEAN' as const,
  signatureRefUrl: SIG_REF,
  stampRefUrl: STAMP_REF,
};
const cso = {
  id: CSO_ID,
  role: 'CSO' as const,
  signatureRefUrl: null,
  stampRefUrl: null,
};

const context = (
  overrides: {
    request?: Partial<NonNullable<DecisionContext['request']>> | null;
    authoriser?: DecisionContext['authoriser'];
    actor?: DecisionContext['actor'];
  } = {}
): DecisionContext => ({
  request:
    overrides.request === null
      ? null
      : {
          id: REQUEST_ID,
          status: 'PENDING_HOD',
          isGuest: false,
          letterUrl: null,
          stampUrl: null,
          ...overrides.request,
        },
  authoriser:
    overrides.authoriser === undefined ? 'DEAN' : overrides.authoriser,
  actor: overrides.actor === undefined ? dean : overrides.actor,
});

// In-memory adapters. `verdicts` maps a submitted URL to its comparison
// result; images are just their URL as bytes so verify can tell them apart.
const makePorts = (
  ctx: DecisionContext,
  options: {
    verdicts?: Record<string, { mismatchPct: number; passed: boolean }>;
    rpcError?: RpcError;
    auditFails?: boolean;
  } = {}
) => {
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const audits: unknown[] = [];
  const decided: unknown[][] = [];
  const mismatchAlerts: unknown[][] = [];
  const verify = vi.fn(async (_ref: Buffer, submitted: Buffer) => ({
    ...(options.verdicts?.[submitted.toString()] ?? {
      mismatchPct: 5,
      passed: true,
    }),
    thresholdPct: 55,
  }));

  const ports: WeekendDecisionPorts = {
    loadContext: async () => ctx,
    rpc: async (name, args) => {
      rpcCalls.push({ name, args: args as Record<string, unknown> });
      if (options.rpcError) return { ok: false, error: options.rpcError };
      return {
        ok: true,
        data: { request_id: REQUEST_ID, decision_id: 'd1', code: '' },
      } as never;
    },
    loadImage: async (url) => Buffer.from(url),
    verify,
    audit: async (entry) => {
      if (options.auditFails) throw new Error('audit insert failed');
      audits.push(entry);
    },
    notify: {
      decided: (...args) => void decided.push(args),
      signatureMismatch: (...args) => void mismatchAlerts.push(args),
    },
  };

  return { ports, rpcCalls, audits, decided, mismatchAlerts, verify };
};

const approve = { requestId: REQUEST_ID, decision: 'APPROVED' as const };

describe('decideWeekend — Dean approval', () => {
  it('verifies the stored letter and records signature_verified=true', async () => {
    const t = makePorts(context({ request: { letterUrl: LETTER } }));
    const result = await decideWeekend(
      { ...approve, actorId: DEAN_ID },
      t.ports
    );

    expect(result).toEqual({ outcome: 'APPROVED', requestId: REQUEST_ID });
    expect(t.verify).toHaveBeenCalledTimes(1);
    expect(t.rpcCalls).toEqual([
      {
        name: 'approve_weekend',
        args: expect.objectContaining({
          p_signature_verified: true,
          p_signature_mismatch_pct: 5,
        }),
      },
    ]);
    expect(t.decided).toEqual([[REQUEST_ID, 'APPROVED', undefined]]);
  });

  it('records signature_verified=false when no letter or stamp was attached', async () => {
    const t = makePorts(context());
    await decideWeekend({ ...approve, actorId: DEAN_ID }, t.ports);

    expect(t.verify).not.toHaveBeenCalled();
    expect(t.rpcCalls[0].args).toMatchObject({ p_signature_verified: false });
  });

  it('holds on a mismatch with canonical URLs and the actor role, and does not approve', async () => {
    const t = makePorts(
      context({ request: { letterUrl: LETTER, stampUrl: STAMP } }),
      { verdicts: { [STAMP]: { mismatchPct: 80, passed: false } } }
    );
    const result = await decideWeekend(
      { ...approve, actorId: DEAN_ID },
      t.ports
    );

    expect(result).toEqual({
      outcome: 'HELD',
      requestId: REQUEST_ID,
      mismatches: { stamp: 80 },
    });
    expect(t.rpcCalls).toEqual([]);
    expect(t.audits).toEqual([
      expect.objectContaining({
        event: 'SIGNATURE_MISMATCH',
        actorRole: 'DEAN',
        payload: {
          signature: {
            ref_url: SIG_REF,
            submitted_url: LETTER,
            mismatch_pct: 5,
          },
          stamp: { ref_url: STAMP_REF, submitted_url: STAMP, mismatch_pct: 80 },
          threshold_pct: 55,
        },
      }),
    ]);
    expect(t.mismatchAlerts).toEqual([[REQUEST_ID, { stamp: 80 }, 55]]);
    expect(t.decided).toEqual([]);
  });

  it('does not report HELD when the hold audit entry cannot be written', async () => {
    const t = makePorts(context({ request: { letterUrl: LETTER } }), {
      verdicts: { [LETTER]: { mismatchPct: 90, passed: false } },
      auditFails: true,
    });
    const result = await decideWeekend(
      { ...approve, actorId: DEAN_ID },
      t.ports
    );

    expect(result).toMatchObject({ outcome: 'REJECTED', reason: 'INTERNAL' });
    expect(t.mismatchAlerts).toEqual([]);
    expect(t.rpcCalls).toEqual([]);
  });

  it('refuses a stored letter that is not a weekend-letters object', async () => {
    const t = makePorts(context({ request: { letterUrl: SIG_REF } }));
    const result = await decideWeekend(
      { ...approve, actorId: DEAN_ID },
      t.ports
    );

    expect(result).toEqual({
      outcome: 'REJECTED',
      reason: 'INVALID_SUBMISSION',
    });
    expect(t.verify).not.toHaveBeenCalled();
    expect(t.rpcCalls).toEqual([]);
  });

  it('requires an onboarded reference signature', async () => {
    const t = makePorts(context({ actor: { ...dean, signatureRefUrl: null } }));
    const result = await decideWeekend(
      { ...approve, actorId: DEAN_ID },
      t.ports
    );
    expect(result).toEqual({
      outcome: 'REJECTED',
      reason: 'ONBOARDING_INCOMPLETE',
    });
  });

  it('skips the stamp check when the Dean has no stamp reference', async () => {
    const t = makePorts(
      context({
        request: { stampUrl: STAMP },
        actor: { ...dean, stampRefUrl: null },
      })
    );
    await decideWeekend({ ...approve, actorId: DEAN_ID }, t.ports);
    expect(t.verify).not.toHaveBeenCalled();
    expect(t.rpcCalls[0].args).toMatchObject({ p_signature_verified: false });
  });
});

describe('decideWeekend — CSO', () => {
  it('approves an Administration request without comparing, recorded as not verified', async () => {
    const t = makePorts(
      context({ actor: cso, authoriser: 'CSO', request: { letterUrl: LETTER } })
    );
    await decideWeekend({ ...approve, actorId: CSO_ID }, t.ports);

    expect(t.verify).not.toHaveBeenCalled();
    expect(t.rpcCalls[0]).toEqual({
      name: 'approve_weekend',
      args: expect.objectContaining({
        p_signature_verified: false,
        p_cso_override: false,
      }),
    });
  });

  it('derives the override when acting on a Dean-authorised request', async () => {
    const t = makePorts(context({ actor: cso, authoriser: 'DEAN' }));
    await decideWeekend({ ...approve, actorId: CSO_ID }, t.ports);
    expect(t.rpcCalls[0].args).toMatchObject({ p_cso_override: true });
  });

  it('reports a refused override as NO_MISMATCH_TO_OVERRIDE', async () => {
    const t = makePorts(context({ actor: cso, authoriser: 'DEAN' }), {
      rpcError: {
        kind: 'FORBIDDEN',
        detail: 'no signature mismatch on record for this request',
      },
    });
    const result = await decideWeekend(
      { ...approve, decision: 'DECLINED', actorId: CSO_ID },
      t.ports
    );
    expect(result).toEqual({
      outcome: 'REJECTED',
      reason: 'NO_MISMATCH_TO_OVERRIDE',
    });
  });
});

describe('decideWeekend — guest and decline', () => {
  it('requires a key to approve a guest request', async () => {
    const t = makePorts(context({ request: { isGuest: true } }));
    const result = await decideWeekend(
      { ...approve, actorId: DEAN_ID },
      t.ports
    );
    expect(result).toEqual({ outcome: 'REJECTED', reason: 'KEY_REQUIRED' });
    expect(t.rpcCalls).toEqual([]);
  });

  it('assigns the key on guest approval without verifying', async () => {
    const t = makePorts(
      context({ request: { isGuest: true, letterUrl: LETTER } })
    );
    await decideWeekend({ ...approve, actorId: DEAN_ID, keyId: 'k1' }, t.ports);
    expect(t.verify).not.toHaveBeenCalled();
    expect(t.rpcCalls[0]).toEqual({
      name: 'approve_guest_weekend',
      args: expect.objectContaining({ p_key_id: 'k1' }),
    });
  });

  it('declines and passes the note to the requester notification', async () => {
    const t = makePorts(context());
    const result = await decideWeekend(
      {
        requestId: REQUEST_ID,
        actorId: DEAN_ID,
        decision: 'DECLINED',
        note: 'No memo',
      },
      t.ports
    );
    expect(result).toEqual({ outcome: 'DECLINED', requestId: REQUEST_ID });
    expect(t.rpcCalls[0].name).toBe('decline_weekend');
    expect(t.decided).toEqual([[REQUEST_ID, 'DECLINED', 'No memo']]);
  });
});

describe('decideWeekend — rejections', () => {
  it('rejects a request that is no longer pending without calling an RPC', async () => {
    const t = makePorts(context({ request: { status: 'APPROVED' } }));
    const result = await decideWeekend(
      { ...approve, actorId: DEAN_ID },
      t.ports
    );
    expect(result).toEqual({ outcome: 'REJECTED', reason: 'ALREADY_DECIDED' });
    expect(t.rpcCalls).toEqual([]);
  });

  it('rejects an unknown request', async () => {
    const t = makePorts(context({ request: null }));
    const result = await decideWeekend(
      { ...approve, actorId: DEAN_ID },
      t.ports
    );
    expect(result).toEqual({ outcome: 'REJECTED', reason: 'NOT_FOUND' });
  });

  it('maps a racing CONFLICT to ALREADY_DECIDED without leaking state names', async () => {
    const t = makePorts(context(), {
      rpcError: {
        kind: 'CONFLICT',
        detail: 'request is not in PENDING_HOD state (current: APPROVED)',
      },
    });
    const result = await decideWeekend(
      { ...approve, actorId: DEAN_ID },
      t.ports
    );
    expect(result).toEqual({ outcome: 'REJECTED', reason: 'ALREADY_DECIDED' });
  });

  it('maps a passed date to DATE_PASSED', async () => {
    const t = makePorts(context(), {
      rpcError: {
        kind: 'CONFLICT',
        detail: 'the requested weekend date has already passed',
      },
    });
    const result = await decideWeekend(
      { ...approve, actorId: DEAN_ID },
      t.ports
    );
    expect(result).toEqual({ outcome: 'REJECTED', reason: 'DATE_PASSED' });
  });
});
