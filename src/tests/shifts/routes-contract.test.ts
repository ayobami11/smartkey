// @vitest-environment node
// Contract for the shifts/* routes: the status and message for every auth
// outcome, bad body, query failure and RPC error kind each route maps, plus
// its success shape. Written against the routes before they moved onto
// route(); kept as the regression net after.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as current } from '@/app/api/shifts/current/route';
import { POST as handover } from '@/app/api/shifts/handover/route';
import { POST as start } from '@/app/api/shifts/start/route';
import { logger } from '@/lib/logger';

import {
  KEY_ID,
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

const hasOp = (ops: Op[], method: string) => ops.some(([m]) => m === method);

beforeEach(() => {
  resetFake();
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
});

// ---------------------------------------------------------------------------
// GET /api/shifts/current
// ---------------------------------------------------------------------------

describe('GET /api/shifts/current', () => {
  const path = '/api/shifts/current';

  describeAuth('shifts/current', current, () => get(path), ['VERIFIER', 'CSO']);

  beforeEach(() => asRole('VERIFIER'));

  // CHANGED: was an un-ref'd 500 'Failed to fetch current shift'.
  it('500 with a ref when the shift query fails', async () => {
    fake.tables.shifts = { data: null, error: { message: 'boom' } };
    expectRef(await call(current, get(path)));
  });

  // CHANGED by the route() migration: a throw used to escape the handler, so
  // Next answered with its own unenveloped 500. It is now an enveloped,
  // ref'd 500.
  it('a throw becomes an enveloped 500 with a ref', async () => {
    fake.tables.shifts = () => {
      throw new Error('client exploded');
    };
    expectRef(await call(current, get(path)));
  });

  it('returns null when no shift is open', async () => {
    fake.tables.shifts = { data: null, error: null };
    expect(await call(current, get(path))).toEqual(success({ shift: null }));
  });

  it('reads the open shift through the admin client', async () => {
    const shift = {
      id: SHIFT_ID,
      shift_number: 2,
      started_at: '2026-10-13T06:00:00Z',
      ended_at: null,
      primary_officer: {
        id: USER_ID,
        full_name: 'Officer Musa',
        photo_url: null,
      },
      secondary_officer: null,
    };
    fake.tables.shifts = { data: shift, error: null };
    expect(await call(current, get(path))).toEqual(success({ shift }));
    const query = fake.queries.find((q) => q.table === 'shifts')!;
    expect(query.client).toBe('admin');
    expect(query.ops).toContainEqual(['is', ['ended_at', null]]);
  });
});

// ---------------------------------------------------------------------------
// POST /api/shifts/start
// ---------------------------------------------------------------------------

describe('POST /api/shifts/start', () => {
  const path = '/api/shifts/start';

  describeAuth('shifts/start', start, () => post(path, {}), ['VERIFIER']);

  beforeEach(() => asRole('VERIFIER'));

  // shifts is read three times: the open-shift guard (`is`), the last shift
  // number (`order`), and the insert.
  const shifts =
    (opts: {
      open?: unknown;
      last?: unknown;
      insert?: { data: unknown; error: { message: string } | null };
    }) =>
    (ops: Op[]) => {
      if (hasOp(ops, 'insert')) {
        return opts.insert ?? { data: null, error: null };
      }
      if (hasOp(ops, 'is')) return { data: opts.open ?? null, error: null };
      return { data: opts.last ?? null, error: null };
    };

  it('409 when a shift is already open', async () => {
    fake.tables.shifts = shifts({ open: { id: SHIFT_ID } });
    expect(await call(start, post(path, {}))).toEqual(
      failure(409, 'A shift is already active. Complete the handover instead.')
    );
  });

  it('500 with a ref when the insert fails', async () => {
    fake.tables.shifts = shifts({
      insert: { data: null, error: { message: 'boom' } },
    });
    expectRef(await call(start, post(path, {})));
  });

  it.each([
    [null, 1],
    [{ shift_number: 1 }, 2],
    [{ shift_number: 3 }, 1],
  ])('after last shift %j, starts shift %i', async (last, expected) => {
    const created = {
      id: SHIFT_ID,
      shift_number: expected,
      started_at: '2026-10-13T06:00:00Z',
    };
    fake.tables.shifts = shifts({
      last,
      insert: { data: created, error: null },
    });

    const res = await call(start, post(path, {}));

    // CHANGED by the route() migration: the envelope status said 200 while
    // the HTTP status was 201.
    expect(res).toEqual(success({ shift: created }, 201));

    const insert = fake.queries.find(
      (q) => q.table === 'shifts' && hasOp(q.ops, 'insert')
    )!;
    const [, [row]] = insert.ops.find(([m]) => m === 'insert')!;
    expect(row).toMatchObject({
      shift_number: expected,
      primary_officer_id: USER_ID,
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/shifts/handover
// ---------------------------------------------------------------------------

describe('POST /api/shifts/handover', () => {
  const path = '/api/shifts/handover';
  const body = { outgoing_shift_id: SHIFT_ID, key_ids: [KEY_ID], bulk: true };

  describeAuth('shifts/handover', handover, () => post(path, body), [
    'VERIFIER',
  ]);

  beforeEach(() => asRole('VERIFIER'));

  it.each([
    ['not JSON', 'not json'],
    ['missing bulk', { outgoing_shift_id: SHIFT_ID, key_ids: [] }],
    ['a non-uuid key id', { ...body, key_ids: ['nope'] }],
  ])('422 for %s', async (_label, bad) => {
    expect(await call(handover, post(path, bad))).toEqual(
      failure(422, 'Invalid request body')
    );
  });

  it.each([
    ['NOT_AUTHENTICATED', 401, 'Not authenticated'],
    [
      'CONFLICT: handover already completed for this shift',
      409,
      'Handover already completed for this shift',
    ],
  ])('maps %s → %i', async (raised, status, message) => {
    fake.rpc.acknowledge_shift_handover = rpcError(raised);
    expect(await call(handover, post(path, body))).toEqual(
      failure(status, message)
    );
  });

  it('500 with a ref for an unrecognised RPC failure', async () => {
    fake.rpc.acknowledge_shift_handover = rpcError('deadlock detected');
    expectRef(await call(handover, post(path, body)));
  });

  it('500 with a ref when the RPC returns no row', async () => {
    fake.rpc.acknowledge_shift_handover = { data: [], error: null };
    expectRef(await call(handover, post(path, body)));
  });

  it('returns the handover id and count', async () => {
    fake.rpc.acknowledge_shift_handover = {
      data: [{ handover_id: 'h-1', acknowledged_count: 1 }],
      error: null,
    };
    expect(await call(handover, post(path, body))).toEqual(
      success({ handover_id: 'h-1', acknowledged_count: 1 })
    );
    expect(fake.rpcCalls).toEqual([
      {
        name: 'acknowledge_shift_handover',
        args: {
          p_outgoing_shift_id: SHIFT_ID,
          p_key_ids: [KEY_ID],
          p_bulk: true,
        },
      },
    ]);
  });
});
