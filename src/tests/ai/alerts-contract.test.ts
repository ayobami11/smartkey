// @vitest-environment node
// Contract for the CSO's AI read routes, ai/risk-alerts and
// ai/signature-alerts: auth outcomes, query failures and success shapes.
// Written against the routes before they moved onto route(); kept as the
// regression net after. ai/verify-signature is deliberately not wrapped and
// not covered here.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as riskAlerts } from '@/app/api/ai/risk-alerts/route';
import { GET as signatureAlerts } from '@/app/api/ai/signature-alerts/route';
import { logger } from '@/lib/logger';

import {
  asRole,
  call,
  describeAuth,
  failure,
  fake,
  get,
  resetFake,
  success,
  type Op,
} from '../http/contract-harness';

vi.mock('@/lib/supabase/server', async () => {
  const h = await import('../http/contract-harness');
  return { createServerClient: async () => h.makeClient('server') };
});
vi.mock('@/lib/supabase/admin', async () => {
  const h = await import('../http/contract-harness');
  return { createAdminClient: () => h.makeClient('admin') };
});

const REQUEST_ID = '22222222-2222-4222-8222-222222222222';
const DEAN_ID = '99999999-9999-4999-8999-999999999999';
const STORAGE = 'https://x.supabase.co/storage/v1/object/public';

const opArgs = (ops: Op[], method: string) =>
  ops.filter(([m]) => m === method).map(([, args]) => args);

beforeEach(() => {
  resetFake();
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);
});

// ---------------------------------------------------------------------------
// GET /api/ai/risk-alerts
// ---------------------------------------------------------------------------

describe('GET /api/ai/risk-alerts', () => {
  const path = '/api/ai/risk-alerts';

  describeAuth('ai/risk-alerts', riskAlerts, () => get(path), ['CSO']);

  beforeEach(() => asRole('CSO'));

  it('500 Failed to fetch risk alerts when the query fails', async () => {
    fake.tables.requests = { data: null, error: { message: 'boom' } };
    expect(await call(riskAlerts, get(path))).toEqual(
      failure(500, 'Failed to fetch risk alerts')
    );
  });

  it('an empty list when there are none', async () => {
    expect(await call(riskAlerts, get(path))).toEqual(success({ alerts: [] }));
  });

  it("returns the last 24h's HIGH-tier issuable or issued requests", async () => {
    const rows = [{ id: REQUEST_ID, risk_tier: 'HIGH' }];
    fake.tables.requests = { data: rows, error: null };
    const before = Date.now();
    expect(await call(riskAlerts, get(path))).toEqual(
      success({ alerts: rows })
    );
    const ops = fake.queries.find((q) => q.table === 'requests')!.ops;
    expect(opArgs(ops, 'eq')).toEqual([['risk_tier', 'HIGH']]);
    expect(opArgs(ops, 'in')).toEqual([
      ['status', ['CODE_ISSUED', 'KEY_ISSUED']],
    ]);
    const [[column, since]] = opArgs(ops, 'gte') as [[string, string]];
    expect(column).toBe('created_at');
    const age = before - new Date(since).getTime();
    expect(age).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 1000);
    expect(age).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 1000);
  });
});

// ---------------------------------------------------------------------------
// GET /api/ai/signature-alerts
// ---------------------------------------------------------------------------

describe('GET /api/ai/signature-alerts', () => {
  const path = '/api/ai/signature-alerts';

  const check = (name: string, pct: number) => ({
    ref_url: `${STORAGE}/hod-signatures/${DEAN_ID}/${name}-ref.png`,
    submitted_url: `${STORAGE}/weekend-letters/${REQUEST_ID}/${name}.png`,
    mismatch_pct: pct,
  });
  const proxied = (name: string, pct: number) => ({
    ref_url: `/api/storage/object?bucket=hod-signatures&path=${DEAN_ID}%2F${name}-ref.png`,
    submitted_url: `/api/storage/object?bucket=weekend-letters&path=${REQUEST_ID}%2F${name}.png`,
    mismatch_pct: pct,
  });

  const pendingRef = {
    profile_id: DEAN_ID,
    type: 'stamp',
    pending_url: `${STORAGE}/hod-signatures/${DEAN_ID}/stamp-new.png`,
    current_ref_url: `${STORAGE}/hod-signatures/${DEAN_ID}/stamp-old.png`,
    mismatch_pct: 62,
    threshold_pct: 55,
    submitted_at: '2026-10-12T09:00:00Z',
    profile: { full_name: 'Prof. Ade' },
  };
  const pendingRefOut = {
    profile_id: DEAN_ID,
    type: 'stamp',
    dean_name: 'Prof. Ade',
    submitted_at: '2026-10-12T09:00:00Z',
    mismatch_pct: 62,
    threshold_pct: 55,
    current_ref_url: `/api/storage/object?bucket=hod-signatures&path=${DEAN_ID}%2Fstamp-old.png`,
    pending_url: `/api/storage/object?bucket=hod-signatures&path=${DEAN_ID}%2Fstamp-new.png`,
  };

  describeAuth('ai/signature-alerts', signatureAlerts, () => get(path), [
    'CSO',
  ]);

  beforeEach(() => {
    asRole('CSO');
    fake.tables.audit_log = {
      data: [
        {
          target_id: REQUEST_ID,
          occurred_at: '2026-10-12T10:00:00Z',
          payload: {
            signature: check('signature', 22.5),
            stamp: null,
            threshold_pct: 55,
          },
        },
        // An older mismatch for the same request is ignored.
        {
          target_id: REQUEST_ID,
          occurred_at: '2026-10-11T10:00:00Z',
          payload: { signature: check('old', 90), threshold_pct: 55 },
        },
      ],
      error: null,
    };
    fake.tables.requests = {
      data: [
        {
          id: REQUEST_ID,
          requested_for: '2026-10-17',
          requester: { id: 'r', full_name: 'Dr. Bakare' },
          key: { id: 'k', code: 'NS-304' },
        },
      ],
      error: null,
    };
    fake.tables.pending_signature_references = {
      data: [pendingRef],
      error: null,
    };
  });

  it.each(['audit_log', 'requests', 'pending_signature_references'])(
    '500 Failed to fetch signature alerts when %s fails',
    async (table) => {
      fake.tables[table] = { data: null, error: { message: 'boom' } };
      expect(await call(signatureAlerts, get(path))).toEqual(
        failure(500, 'Failed to fetch signature alerts')
      );
    }
  );

  // CHANGED (bug fix): with no weekend-request mismatches the route used to
  // return early, so held reference replacements never reached the CSO.
  it('still returns held reference replacements when there are no mismatch entries', async () => {
    fake.tables.audit_log = { data: [], error: null };
    expect(await call(signatureAlerts, get(path))).toEqual(
      success({ alerts: [], reference_replacements: [pendingRefOut] })
    );
  });

  // CHANGED: the route now starts from the PENDING_HOD requests, so with
  // none there is no audit query at all (it used to skip the requests one).
  it('skips the audit read when no request is pending', async () => {
    fake.tables.requests = { data: [], error: null };
    expect(await call(signatureAlerts, get(path))).toEqual(
      success({ alerts: [], reference_replacements: [pendingRefOut] })
    );
    expect(fake.queries.some((q) => q.table === 'audit_log')).toBe(false);
  });

  // CHANGED (bug fix): the 200 newest SIGNATURE_MISMATCH entries were read
  // first, so a still-held request older than those dropped off the list.
  it('reads mismatch entries for exactly the pending requests, with no cap', async () => {
    await call(signatureAlerts, get(path));
    const audit = fake.queries.find((q) => q.table === 'audit_log')!.ops;
    expect(opArgs(audit, 'in')).toEqual([['target_id', [REQUEST_ID]]]);
    expect(audit.some(([m]) => m === 'limit')).toBe(false);
  });

  it('returns held requests (latest mismatch, proxied URLs) and replacements', async () => {
    expect(await call(signatureAlerts, get(path))).toEqual(
      success({
        alerts: [
          {
            id: REQUEST_ID,
            requested_for: '2026-10-17',
            requester: { id: 'r', full_name: 'Dr. Bakare' },
            key: { id: 'k', code: 'NS-304' },
            occurred_at: '2026-10-12T10:00:00Z',
            signature: proxied('signature', 22.5),
            stamp: null,
            threshold_pct: 55,
          },
        ],
        reference_replacements: [pendingRefOut],
      })
    );
    const audit = fake.queries.find((q) => q.table === 'audit_log')!.ops;
    expect(opArgs(audit, 'eq')).toEqual([
      ['event', 'SIGNATURE_MISMATCH'],
      ['target_type', 'request'],
    ]);
    const requests = fake.queries.find((q) => q.table === 'requests')!.ops;
    // CHANGED: the pending requests are read first, unfiltered by id.
    expect(opArgs(requests, 'in')).toEqual([]);
    expect(opArgs(requests, 'eq')).toEqual([['status', 'PENDING_HOD']]);
  });

  it('lists no alert for a pending request with no mismatch entry', async () => {
    fake.tables.audit_log = { data: [], error: null };
    expect(await call(signatureAlerts, get(path))).toEqual(
      success({ alerts: [], reference_replacements: [pendingRefOut] })
    );
  });

  it('names an unknown Dean when the profile join is empty', async () => {
    fake.tables.pending_signature_references = {
      data: [{ ...pendingRef, profile: null }],
      error: null,
    };
    const res = await call(signatureAlerts, get(path));
    expect(res.body.data.reference_replacements[0].dean_name).toBe(
      'Unknown Dean'
    );
  });
});
