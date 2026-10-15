// @vitest-environment node
// Contract for the keys/* routes: the status and message for every auth
// outcome, bad body, query failure and RPC error kind each route maps, plus
// its success shape. Written against the routes before they moved onto
// route(); kept as the regression net after.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as availability } from '@/app/api/keys/availability/route';
import { GET as history } from '@/app/api/keys/history/route';
import { POST as markLost } from '@/app/api/keys/mark-lost/route';
import { GET as out } from '@/app/api/keys/out/route';
import { POST as returnKey } from '@/app/api/keys/return/route';
import {
  deriveKeyAvailabilityList,
  type ActiveRequestRow,
} from '@/lib/keys/availability';
import {
  shapeOutstanding,
  type OutstandingSourceRow,
} from '@/lib/keys/outstanding';
import { logger } from '@/lib/logger';
import { rewriteStorageUrls } from '@/lib/storage/object-url';

import {
  KEY_ID,
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

beforeEach(() => {
  resetFake();
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
});

// ---------------------------------------------------------------------------
// POST /api/keys/return
// ---------------------------------------------------------------------------

describe('POST /api/keys/return', () => {
  const path = '/api/keys/return';
  const body = { request_id: REQUEST_ID, code: '123456' };

  describeAuth('keys/return', returnKey, () => post(path, body), ['VERIFIER']);

  beforeEach(() => asRole('VERIFIER'));

  it.each([
    ['not JSON', 'not json'],
    ['neither code nor override reason', { request_id: REQUEST_ID }],
    ['a code that is not 6 digits', { request_id: REQUEST_ID, code: '12' }],
    ['a non-uuid request id', { request_id: 'nope', code: '123456' }],
  ])('422 for %s', async (_label, bad) => {
    expect(await call(returnKey, post(path, bad))).toEqual(
      failure(422, 'Invalid request body')
    );
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it.each([
    ['NOT_AUTHENTICATED', 401, 'Not authenticated'],
    [
      `NOT_FOUND: request ${REQUEST_ID} does not exist`,
      404,
      'Transaction not found',
    ],
    [
      'NOT_ISSUED: request is not in KEY_ISSUED state (current: KEY_RETURNED)',
      409,
      'Key has already been returned',
    ],
    [
      'BAD_RETURN_CODE: the return code does not match',
      404,
      'Return code not recognised. Ask the requester to check it.',
    ],
    [
      'EXPIRED_RETURN_CODE: the return code has expired',
      404,
      'Return code has expired. Ask the requester to generate a new one.',
    ],
    [
      'NO_VERIFICATION: a return code or an override reason is required',
      422,
      'Enter the return code, or give a reason to return without one.',
    ],
  ])('maps %s → %i', async (raised, status, message) => {
    fake.rpc.return_key = rpcError(raised);
    expect(await call(returnKey, post(path, body))).toEqual(
      failure(status, message)
    );
  });

  it('500 with a ref for an unrecognised RPC failure', async () => {
    fake.rpc.return_key = rpcError('connection reset');
    expectRef(await call(returnKey, post(path, body)));
  });

  it('500 with a ref when the RPC returns no row', async () => {
    fake.rpc.return_key = { data: [], error: null };
    expectRef(await call(returnKey, post(path, body)));
  });

  it('returns the RPC row, with the session user as verifier', async () => {
    fake.rpc.return_key = {
      data: [
        {
          request_id: REQUEST_ID,
          returned_at: '2026-10-13T10:00:00Z',
          verified: false,
          extra: 'not forwarded',
        },
      ],
      error: null,
    };
    const res = await call(
      returnKey,
      post(path, {
        request_id: REQUEST_ID,
        override_reason: 'Lost the code',
        returner_id: KEY_ID,
      })
    );
    expect(res).toEqual(
      success({
        request_id: REQUEST_ID,
        returned_at: '2026-10-13T10:00:00Z',
        verified: false,
      })
    );
    expect(fake.rpcCalls).toEqual([
      {
        name: 'return_key',
        args: {
          p_request_id: REQUEST_ID,
          p_verifier_id: USER_ID,
          p_code: undefined,
          p_returner_id: KEY_ID,
          p_override_reason: 'Lost the code',
        },
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// POST /api/keys/mark-lost
// ---------------------------------------------------------------------------

describe('POST /api/keys/mark-lost', () => {
  const path = '/api/keys/mark-lost';
  const body = { key_id: KEY_ID, note: 'Not returned after audit' };

  describeAuth('keys/mark-lost', markLost, () => post(path, body), ['CSO']);

  beforeEach(() => asRole('CSO'));

  it.each([
    ['not JSON', 'not json'],
    ['an empty note', { key_id: KEY_ID, note: '' }],
    ['a non-uuid key id', { key_id: 'nope', note: 'x' }],
  ])('422 for %s', async (_label, bad) => {
    expect(await call(markLost, post(path, bad))).toEqual(
      failure(422, 'Invalid request body')
    );
    expect(fake.rpcCalls).toHaveLength(0);
  });

  // CHANGED: the key lookup, retirement and incident insert moved into the
  // mark_key_lost RPC, so these outcomes are now RPC error kinds. Statuses
  // and messages are unchanged.
  it.each([
    [`NOT_FOUND: key ${KEY_ID} does not exist`, 404, 'Key not found'],
    ['CONFLICT: key is already retired', 409, 'Key is already retired'],
    // CHANGED: new — a whitespace-only note used to pass and be stored.
    ['VALIDATION: a note is required', 422, 'Invalid request body'],
  ])('maps %s → %i', async (raised, status, message) => {
    fake.rpc.mark_key_lost = rpcError(raised);
    expect(await call(markLost, post(path, body))).toEqual(
      failure(status, message)
    );
  });

  // CHANGED: replaces the separate "key update fails" and "incident insert
  // fails" 500s. Retirement, incident and audit entry are one transaction
  // now, so any failure rolls all three back instead of leaving a retired
  // key with no incident.
  it('500 with a ref for an unrecognised RPC failure', async () => {
    fake.rpc.mark_key_lost = rpcError('statement timeout');
    expectRef(await call(markLost, post(path, body)));
  });

  it('500 with a ref when the RPC returns no row', async () => {
    fake.rpc.mark_key_lost = { data: [], error: null };
    expectRef(await call(markLost, post(path, body)));
  });

  it('retires the key and logs a HIGH MISSING_KEY incident', async () => {
    fake.rpc.mark_key_lost = {
      data: [
        { key_id: KEY_ID, incident_id: 'inc-1', reference: 'INC-2026-0042' },
      ],
      error: null,
    };

    expect(await call(markLost, post(path, body))).toEqual(
      success({ key_id: KEY_ID, incident_id: 'inc-1' })
    );

    // CHANGED: the incident row is built inside the RPC (pgTAP file 15 pins
    // its columns); the route's contract is the RPC call and no direct write.
    expect(fake.rpcCalls).toEqual([
      {
        name: 'mark_key_lost',
        args: { p_key_id: KEY_ID, p_note: body.note },
      },
    ]);
    expect(fake.queries.some((q) => q.table === 'keys')).toBe(false);
    expect(fake.queries.some((q) => q.table === 'incidents')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GET /api/keys/out
// ---------------------------------------------------------------------------

describe('GET /api/keys/out', () => {
  const path = '/api/keys/out';

  describeAuth('keys/out', out, () => get(path), ['CSO', 'VERIFIER']);

  beforeEach(() => asRole('VERIFIER'));

  // CHANGED: was an un-ref'd 500 'Failed to fetch outstanding keys'.
  it('500 with a ref when the query fails', async () => {
    fake.tables.requests = { data: null, error: { message: 'boom' } };
    expectRef(await call(out, get(path)));
  });

  it.each([
    ['an unknown zone', '?zone=BASEMENT'],
    ['a non-boolean overdue_only', '?overdue_only=yes'],
  ])('422 for %s, before querying', async (_label, qs) => {
    expect(await call(out, get(`${path}${qs}`))).toEqual(
      failure(422, 'Invalid query parameters')
    );
    expect(fake.queries.some((q) => q.table === 'requests')).toBe(false);
  });

  it('returns the shaped outstanding rows', async () => {
    const rows = [
      {
        id: REQUEST_ID,
        status: 'KEY_ISSUED',
        issued_at: '2026-10-13T08:00:00Z',
        return_deadline: '2000-01-01T17:00:00Z',
        created_at: '2026-10-13T07:55:00Z',
        requester: { id: USER_ID, full_name: 'Dr. Bakare', photo_url: null },
        guest: null,
        key: {
          id: KEY_ID,
          code: 'NS-1',
          room_name: 'Senate Hall A',
          zone: 'NEW_SENATE',
          status: 'ISSUED',
          key_count: 1,
        },
      },
    ];
    fake.tables.requests = { data: rows, error: null };

    const res = await call(
      out,
      get(`${path}?zone=NEW_SENATE&overdue_only=true`)
    );
    expect(res).toEqual(
      success(
        rewriteStorageUrls({
          outstanding: shapeOutstanding(
            rows as unknown as OutstandingSourceRow[]
          ),
        })
      )
    );

    const query = fake.queries.find((q) => q.table === 'requests')!;
    expect(query.client).toBe('admin');
    expect(query.ops).toContainEqual([
      'eq',
      ['key:keys!key_id.zone', 'NEW_SENATE'],
    ]);
    expect(
      query.ops.some(([m, a]) => m === 'lt' && a[0] === 'return_deadline')
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /api/keys/history
// ---------------------------------------------------------------------------

describe('GET /api/keys/history', () => {
  const path = '/api/keys/history';

  describeAuth('keys/history', history, () => get(path), ['CSO', 'DEAN']);

  // CHANGED: both were an un-ref'd 500 'Failed to fetch key history'.
  it('500 with a ref when the history query fails', async () => {
    asRole('CSO');
    fake.tables.requests = { data: null, error: { message: 'boom' } };
    expectRef(await call(history, get(path)));
  });

  it("500 with a ref when a Dean's unit key lookup fails", async () => {
    asRole('DEAN');
    fake.tables.keys = { data: null, error: { message: 'boom' } };
    expectRef(await call(history, get(path)));
  });

  it.each([
    ['a non-uuid key_id', '?key_id=NS-304'],
    ['a non-uuid requester_id', '?requester_id=me'],
    ['a malformed from', '?from=today'],
    ['a malformed to', '?to=2026-02-30T00:00:00Z'],
    ['a non-numeric limit', '?limit=ten'],
    ['a malformed cursor', '?cursor=abc'],
  ])('422 for %s, before querying', async (_label, qs) => {
    asRole('CSO');
    expect(await call(history, get(`${path}${qs}`))).toEqual(
      failure(422, 'Invalid query parameters')
    );
    expect(fake.queries.some((q) => q.table === 'requests')).toBe(false);
  });

  it('a Dean with no unit gets an empty page, with no query at all', async () => {
    fake.profile = { role: 'DEAN', unit_id: null, full_name: 'Test User' };
    fake.tables.requests = { data: [{ id: 'leak' }], error: null };
    expect(await call(history, get(path))).toEqual(
      success({ transactions: [], next_cursor: null })
    );
    expect(fake.queries.some((q) => q.table === 'requests')).toBe(false);
    expect(fake.queries.some((q) => q.table === 'keys')).toBe(false);
  });

  it('applies the key and requester filters', async () => {
    asRole('CSO');
    fake.tables.requests = { data: [], error: null };
    await call(
      history,
      get(`${path}?key_id=${KEY_ID}&requester_id=${USER_ID}&limit=10`)
    );
    const query = fake.queries.find((q) => q.table === 'requests')!;
    expect(query.ops).toContainEqual(['eq', ['key_id', KEY_ID]]);
    expect(query.ops).toContainEqual(['eq', ['requester_id', USER_ID]]);
    expect(query.ops).toContainEqual(['limit', [11]]);
  });

  it('a Dean whose unit has no keys gets an empty page', async () => {
    asRole('DEAN');
    fake.tables.keys = { data: [], error: null };
    expect(await call(history, get(path))).toEqual(
      success({ transactions: [], next_cursor: null })
    );
    expect(fake.queries.some((q) => q.table === 'requests')).toBe(false);
  });

  it("scopes a Dean to their unit's keys", async () => {
    asRole('DEAN');
    fake.tables.keys = { data: [{ id: KEY_ID }], error: null };
    fake.tables.requests = { data: [], error: null };
    expect(await call(history, get(path))).toEqual(
      success({ transactions: [], next_cursor: null })
    );
    const query = fake.queries.find((q) => q.table === 'requests')!;
    expect(query.ops).toContainEqual(['in', ['key_id', [KEY_ID]]]);
  });

  it('pages with limit + 1 and a created_at cursor', async () => {
    asRole('CSO');
    const rows = [
      { id: 'a', created_at: '2026-10-13T09:00:00Z' },
      { id: 'b', created_at: '2026-10-13T08:00:00Z' },
    ];
    fake.tables.requests = { data: rows, error: null };
    expect(await call(history, get(`${path}?limit=1`))).toEqual(
      success({ transactions: [rows[0]], next_cursor: rows[0].created_at })
    );
  });
});

// ---------------------------------------------------------------------------
// GET /api/keys/availability
// ---------------------------------------------------------------------------

describe('GET /api/keys/availability', () => {
  const path = '/api/keys/availability';

  describeAuth('keys/availability', availability, () => get(path), [
    'REQUESTER',
  ]);

  beforeEach(() => asRole('REQUESTER'));

  it('scopes the slot read to the session user', async () => {
    fake.tables.authorisations = { data: [], error: null };
    expect(await call(availability, get(path))).toEqual(success({ keys: [] }));
    const slots = fake.queries.find((q) => q.table === 'authorisations')!;
    expect(slots.client).toBe('server');
    expect(slots.ops).toContainEqual(['eq', ['profile_id', USER_ID]]);
    expect(fake.queries.some((q) => q.table === 'keys')).toBe(false);
  });

  it('500 with a ref when the slot query fails', async () => {
    fake.tables.authorisations = { data: null, error: { message: 'boom' } };
    expectRef(await call(availability, get(path)));
  });

  it('500 with a ref when the keys query fails', async () => {
    fake.tables.authorisations = { data: [{ key_id: KEY_ID }], error: null };
    fake.tables.keys = { data: null, error: { message: 'boom' } };
    expectRef(await call(availability, get(path)));
  });

  it('500 with a ref when the requests query fails', async () => {
    fake.tables.authorisations = { data: [{ key_id: KEY_ID }], error: null };
    fake.tables.keys = {
      data: [{ id: KEY_ID, status: 'AVAILABLE', key_count: 1 }],
      error: null,
    };
    fake.tables.requests = { data: null, error: { message: 'boom' } };
    expectRef(await call(availability, get(path)));
  });

  it('returns the derived availability list', async () => {
    const keys = [{ id: KEY_ID, status: 'AVAILABLE', key_count: 1 }];
    fake.tables.authorisations = { data: [{ key_id: KEY_ID }], error: null };
    fake.tables.keys = { data: keys, error: null };
    fake.tables.requests = { data: [], error: null };
    expect(await call(availability, get(path))).toEqual(
      success({
        keys: deriveKeyAvailabilityList(
          keys as Parameters<typeof deriveKeyAvailabilityList>[0],
          [] as ActiveRequestRow[]
        ),
      })
    );
  });
});
