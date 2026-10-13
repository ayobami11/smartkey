// @vitest-environment node
// Contract for the reports/* and incidents routes: the status and message for
// every auth outcome, bad body, query failure and RPC error kind each route
// maps, plus its success shape. Written against the routes before they moved
// onto route(); kept as the regression net after.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as comment } from '@/app/api/reports/[id]/comments/route';
import { POST as generate } from '@/app/api/reports/generate/route';
import { GET as reports } from '@/app/api/reports/route';
import {
  GET as listIncidents,
  POST as logIncident,
} from '@/app/api/incidents/route';
import { fillShiftReport } from '@/lib/ai/reports/generate';
import { writeAuditEntry } from '@/lib/audit';
import { logger } from '@/lib/logger';

import {
  KEY_ID,
  REPORT_ID,
  SHIFT_ID,
  USER_ID,
  asRole,
  call,
  describeAuth,
  expectRef,
  failure,
  fake,
  get,
  post,
  resetFake,
  rpcError,
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
vi.mock('@/lib/audit', () => ({ writeAuditEntry: vi.fn() }));
vi.mock('@/lib/ai/reports/generate', () => ({ fillShiftReport: vi.fn() }));

const hasOp = (ops: Op[], method: string) => ops.some(([m]) => m === method);

const GENERATED_AT = '2026-10-13T18:00:00.000Z';

beforeEach(() => {
  resetFake();
  vi.mocked(writeAuditEntry).mockReset();
  vi.mocked(fillShiftReport).mockReset();
  vi.mocked(fillShiftReport).mockResolvedValue({
    generated_at: GENERATED_AT,
  } as Awaited<ReturnType<typeof fillShiftReport>>);
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
});

// ---------------------------------------------------------------------------
// GET /api/reports
// ---------------------------------------------------------------------------

describe('GET /api/reports', () => {
  const path = '/api/reports';

  describeAuth('reports', reports, () => get(path), ['CSO']);

  beforeEach(() => asRole('CSO'));

  it('500 when the query fails', async () => {
    fake.tables.shift_reports = { data: null, error: { message: 'boom' } };
    expect(await call(reports, get(path))).toEqual(
      failure(500, 'Failed to fetch reports')
    );
  });

  it('pages with limit + 1 and a generated_at cursor', async () => {
    const rows = [
      { id: 'a', generated_at: '2026-10-13T18:00:00Z' },
      { id: 'b', generated_at: '2026-10-12T18:00:00Z' },
    ];
    fake.tables.shift_reports = { data: rows, error: null };
    expect(
      await call(reports, get(`${path}?limit=1&shift_id=${SHIFT_ID}`))
    ).toEqual(
      success({ reports: [rows[0]], next_cursor: rows[0].generated_at })
    );
    const query = fake.queries.find((q) => q.table === 'shift_reports')!;
    expect(query.ops).toContainEqual(['eq', ['shift_id', SHIFT_ID]]);
    expect(query.ops).toContainEqual(['limit', [2]]);
  });
});

// ---------------------------------------------------------------------------
// POST /api/reports/generate
// ---------------------------------------------------------------------------

describe('POST /api/reports/generate', () => {
  const path = '/api/reports/generate';
  const body = { shift_id: SHIFT_ID };

  describeAuth('reports/generate', generate, () => post(path, body), ['CSO']);

  beforeEach(() => asRole('CSO'));

  it.each([
    ['not JSON', 'not json'],
    ['a non-uuid shift id', { shift_id: 'nope' }],
  ])('422 for %s', async (_label, bad) => {
    expect(await call(generate, post(path, bad))).toEqual(
      failure(422, 'Invalid request body')
    );
  });

  it('409 when a generated report already exists', async () => {
    fake.tables.shift_reports = {
      data: { id: REPORT_ID, markdown: '# Shift report' },
      error: null,
    };
    expect(await call(generate, post(path, body))).toEqual(
      failure(409, 'Report already generated for this shift')
    );
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it.each([
    ['NOT_AUTHENTICATED', 401, 'Not authenticated'],
    ['FORBIDDEN: only CSO can generate reports', 403, 'Forbidden'],
    [`NOT_FOUND: shift ${SHIFT_ID} does not exist`, 404, 'Shift not found'],
    [
      `CONFLICT: a report already exists for shift ${SHIFT_ID}`,
      409,
      'Report already generated for this shift',
    ],
  ])('maps %s → %i', async (raised, status, message) => {
    fake.rpc.generate_shift_report = rpcError(raised);
    expect(await call(generate, post(path, body))).toEqual(
      failure(status, message)
    );
    expect(fillShiftReport).not.toHaveBeenCalled();
  });

  it('500 with a ref for an unrecognised RPC failure', async () => {
    fake.rpc.generate_shift_report = rpcError('statement timeout');
    expectRef(await call(generate, post(path, body)));
  });

  it('500 with a ref when the RPC returns no report id', async () => {
    fake.rpc.generate_shift_report = { data: [{}], error: null };
    expectRef(await call(generate, post(path, body)));
  });

  // CHANGED by the route() migration: the envelope status said 200 while
  // the HTTP status was 201.
  const created = (reportId: string) =>
    success({ report_id: reportId, generated_at: GENERATED_AT }, 201);

  it('creates the placeholder via the RPC and fills it', async () => {
    fake.rpc.generate_shift_report = {
      data: [{ report_id: REPORT_ID }],
      error: null,
    };
    expect(await call(generate, post(path, body))).toEqual(created(REPORT_ID));
    expect(fake.rpcCalls).toEqual([
      { name: 'generate_shift_report', args: { p_shift_id: SHIFT_ID } },
    ]);
    expect(writeAuditEntry).not.toHaveBeenCalled();
    expect(vi.mocked(fillShiftReport).mock.calls[0][1]).toEqual({
      shiftId: SHIFT_ID,
      reportId: REPORT_ID,
    });
  });

  // Known follow-up, not fixed here: the audit entry is written before the
  // report is filled, and its result is not checked.
  it('adopts a PENDING_GENERATION placeholder, auditing it directly', async () => {
    fake.tables.shift_reports = {
      data: { id: REPORT_ID, markdown: 'PENDING_GENERATION' },
      error: null,
    };
    expect(await call(generate, post(path, body))).toEqual(created(REPORT_ID));
    expect(fake.rpcCalls).toHaveLength(0);
    expect(writeAuditEntry).toHaveBeenCalledWith({
      event: 'SHIFT_REPORT_INITIATED',
      actorId: USER_ID,
      actorRole: 'CSO',
      targetType: 'shift_report',
      targetId: REPORT_ID,
      payload: { shift_id: SHIFT_ID, adopted_pending_placeholder: true },
    });
  });

  it('500 with a ref when generation throws', async () => {
    fake.rpc.generate_shift_report = {
      data: [{ report_id: REPORT_ID }],
      error: null,
    };
    vi.mocked(fillShiftReport).mockRejectedValue(new Error('gemini down'));
    expectRef(await call(generate, post(path, body)));
  });
});

// ---------------------------------------------------------------------------
// POST /api/reports/[id]/comments
// ---------------------------------------------------------------------------

describe('POST /api/reports/[id]/comments', () => {
  const path = `/api/reports/${REPORT_ID}/comments`;
  const params = { id: REPORT_ID };
  const body = { text: 'Reviewed.' };

  describeAuth(
    'reports/comments',
    comment,
    () => post(path, body),
    ['CSO'],
    params
  );

  beforeEach(() => asRole('CSO'));

  it.each([
    ['not JSON', 'not json'],
    ['empty text', { text: '' }],
  ])('422 for %s', async (_label, bad) => {
    expect(await call(comment, post(path, bad), params)).toEqual(
      failure(422, 'Invalid request body')
    );
  });

  it.each([
    ['NOT_AUTHENTICATED', 401, 'Not authenticated'],
    [`NOT_FOUND: report ${REPORT_ID} does not exist`, 404, 'Report not found'],
    [
      'VALIDATION: comment text cannot be empty',
      422,
      'Comment text cannot be empty',
    ],
  ])('maps %s → %i', async (raised, status, message) => {
    fake.rpc.add_report_comment = rpcError(raised);
    expect(await call(comment, post(path, body), params)).toEqual(
      failure(status, message)
    );
  });

  it('500 with a ref for an unrecognised RPC failure', async () => {
    fake.rpc.add_report_comment = rpcError('statement timeout');
    expectRef(await call(comment, post(path, body), params));
  });

  // CHANGED by the route() migration: a non-UUID id used to reach the RPC,
  // whose uuid cast failed, so the caller saw a 500 for a missing report.
  it('404 for a non-uuid report id, without calling the RPC', async () => {
    expect(await call(comment, post(path, body), { id: 'nope' })).toEqual(
      failure(404, 'Report not found')
    );
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it('500 with a ref when the RPC returns no row', async () => {
    fake.rpc.add_report_comment = { data: [], error: null };
    expectRef(await call(comment, post(path, body), params));
  });

  it('returns the comment id and timestamp', async () => {
    fake.rpc.add_report_comment = {
      data: [{ comment_id: 'c-1', created_at: '2026-10-13T19:00:00Z' }],
      error: null,
    };
    const res = await call(comment, post(path, body), params);
    // CHANGED by the route() migration: the envelope status said 200 while
    // the HTTP status was 201.
    expect(res).toEqual(
      success({ comment_id: 'c-1', created_at: '2026-10-13T19:00:00Z' }, 201)
    );
    expect(fake.rpcCalls).toEqual([
      {
        name: 'add_report_comment',
        args: { p_report_id: REPORT_ID, p_text: 'Reviewed.' },
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// GET /api/incidents
// ---------------------------------------------------------------------------

describe('GET /api/incidents', () => {
  const path = '/api/incidents';

  describeAuth('incidents GET', listIncidents, () => get(path), ['CSO']);

  beforeEach(() => asRole('CSO'));

  it('500 when the query fails', async () => {
    fake.tables.incidents = { data: null, error: { message: 'boom' } };
    expect(await call(listIncidents, get(path))).toEqual(
      failure(500, 'Failed to fetch incidents')
    );
  });

  it('pages with limit + 1 and a logged_at cursor', async () => {
    const rows = [
      { id: 'a', logged_at: '2026-10-13T10:00:00Z' },
      { id: 'b', logged_at: '2026-10-13T09:00:00Z' },
    ];
    fake.tables.incidents = { data: rows, error: null };
    expect(
      await call(listIncidents, get(`${path}?limit=1&severity=HIGH`))
    ).toEqual(
      success({ incidents: [rows[0]], next_cursor: rows[0].logged_at })
    );
    const query = fake.queries.find((q) => q.table === 'incidents')!;
    expect(query.client).toBe('server');
    expect(query.ops).toContainEqual(['eq', ['severity', 'HIGH']]);
  });
});

// ---------------------------------------------------------------------------
// POST /api/incidents
// ---------------------------------------------------------------------------

describe('POST /api/incidents', () => {
  const path = '/api/incidents';
  const body = {
    type: 'MISSING_KEY',
    severity: 'HIGH',
    description: 'Key not on hook',
    related_key_id: KEY_ID,
    occurred_at: '2026-10-13T09:00:00Z',
  };

  describeAuth('incidents POST', logIncident, () => post(path, body), [
    'CSO',
    'VERIFIER',
  ]);

  beforeEach(() => asRole('VERIFIER'));

  it.each([
    ['not JSON', 'not json'],
    ['an unknown type', { ...body, type: 'FIRE' }],
    ['an empty description', { ...body, description: '' }],
    ['no occurred_at', { ...body, occurred_at: '' }],
  ])('422 for %s', async (_label, bad) => {
    expect(await call(logIncident, post(path, bad))).toEqual(
      failure(422, 'Invalid request body')
    );
  });

  it('500 with a ref when the insert fails', async () => {
    fake.tables.incidents = { data: null, error: { message: 'boom' } };
    expectRef(await call(logIncident, post(path, body)));
  });

  it('logs the incident against the open shift', async () => {
    fake.tables.shifts = { data: { id: SHIFT_ID }, error: null };
    fake.tables.incidents = (ops) =>
      hasOp(ops, 'insert')
        ? { data: { id: 'inc-1', reference: 'INC-2026-0042' }, error: null }
        : { data: null, error: null };

    const res = await call(logIncident, post(path, body));
    // CHANGED by the route() migration: the envelope status said 200 while
    // the HTTP status was 201.
    expect(res).toEqual(
      success({ incident_id: 'inc-1', reference: 'INC-2026-0042' }, 201)
    );

    const insert = fake.queries.find((q) => q.table === 'incidents')!;
    expect(insert.client).toBe('admin');
    const [, [row]] = insert.ops.find(([m]) => m === 'insert')!;
    expect(row).toEqual({
      shift_id: SHIFT_ID,
      logged_by: USER_ID,
      type: 'MISSING_KEY',
      severity: 'HIGH',
      description: 'Key not on hook',
      related_key_id: KEY_ID,
      related_person_id: null,
      status: 'OPEN',
      occurred_at: '2026-10-13T09:00:00Z',
    });
  });
});
