// @vitest-environment node
// Contract for the requests/* mutation routes other than collect and
// hod-decision: the status and message for every auth outcome, bad body and
// RPC error kind each route maps, plus its success shape. Written against the
// routes before they moved onto route(); kept as the regression net after.
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { POST as cancel } from '@/app/api/requests/cancel/route';
import { POST as csoDecision } from '@/app/api/requests/cso-decision/route';
import { POST as dismiss } from '@/app/api/requests/dismiss/route';
import { POST as expire } from '@/app/api/requests/expire/route';
import { POST as requestReturn } from '@/app/api/requests/request-return/route';
import { POST as submit } from '@/app/api/requests/submit/route';
import { POST as weekendCode } from '@/app/api/requests/weekend-code/route';
import { logger } from '@/lib/logger';
import { notifyAfterResponse } from '@/lib/notifications/notify';

import {
  KEY_ID,
  REF_PATTERN,
  REQUEST_ID,
  USER_ID,
  call,
  failure,
  fake,
  post,
  resetFake,
  rpcError,
  success,
} from './route-harness';

vi.mock('@/lib/supabase/server', async () => {
  const h = await import('./route-harness');
  return { createServerClient: async () => h.makeClient('server') };
});
vi.mock('@/lib/supabase/admin', async () => {
  const h = await import('./route-harness');
  return { createAdminClient: () => h.makeClient('admin') };
});
vi.mock('@/lib/notifications/notify', () => ({
  notifyAfterResponse: vi.fn(),
}));

type Role = 'CSO' | 'DEAN' | 'VERIFIER' | 'REQUESTER';
type Outcome = [status: number, message: string];

// The weekend fixtures request Saturday 2026-10-17. Pin "today" to the Tuesday
// before, so they stay valid whatever day the suite runs.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-13T10:00:00Z'));
});
afterAll(() => {
  vi.useRealTimers();
});

const asRole = (role: Role) => {
  fake.profile = { role, unit_id: 'unit-1', full_name: 'Test User' };
};

const expectRef = (res: { status: number; body: { error: string } }) => {
  expect(res.status).toBe(500);
  expect(res.body).toMatchObject({ data: null, status: 500 });
  expect(res.body.error).toMatch(REF_PATTERN);
};

beforeEach(() => {
  resetFake();
  vi.mocked(notifyAfterResponse).mockClear();
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
});

// ---------------------------------------------------------------------------
// Shared shape for the routes that take `{ request_id }` and call one RPC.
// ---------------------------------------------------------------------------

type SimpleRoute = {
  name: string;
  handler: unknown;
  path: string;
  rpc: string;
  role: Role;
  /** Outcome for a signed-in user with no profile row. */
  noProfile: Outcome | 'proceeds';
  /** Outcome for a signed-in user with the wrong role. */
  wrongRole: Outcome | 'proceeds';
  errors: Array<[raised: string, status: number, message: string]>;
  okRow: Record<string, unknown>;
  okData: Record<string, unknown>;
};

const SIMPLE_ROUTES: SimpleRoute[] = [
  {
    name: 'request-return',
    handler: requestReturn,
    path: '/api/requests/request-return',
    rpc: 'request_return',
    role: 'REQUESTER',
    noProfile: [401, 'Unauthorized'],
    wrongRole: [403, 'Forbidden'],
    errors: [
      ['NOT_AUTHENTICATED: no session', 401, 'Not authenticated'],
      [
        `NOT_FOUND: request ${REQUEST_ID} does not exist`,
        404,
        'Request not found',
      ],
      [
        'FORBIDDEN: request does not belong to the caller',
        403,
        'This is not your request',
      ],
      [
        'NOT_ISSUED: request is not in KEY_ISSUED state (current: KEY_RETURNED)',
        409,
        'This key is not currently issued to you',
      ],
    ],
    okRow: {
      request_id: REQUEST_ID,
      return_code: '654321',
      return_code_expires_at: '2026-10-13T09:15:00Z',
    },
    okData: {
      request_id: REQUEST_ID,
      return_code: '654321',
      return_code_expires_at: '2026-10-13T09:15:00Z',
    },
  },
  {
    name: 'weekend-code',
    handler: weekendCode,
    path: '/api/requests/weekend-code',
    rpc: 'generate_weekend_code',
    role: 'REQUESTER',
    noProfile: [401, 'Unauthorized'],
    wrongRole: [403, 'Forbidden'],
    errors: [
      ['NOT_AUTHENTICATED: no session', 401, 'Not authenticated'],
      [
        `NOT_FOUND: request ${REQUEST_ID} does not exist`,
        404,
        'Request not found',
      ],
      ['FORBIDDEN: not your request', 403, 'This is not your request'],
      [
        'TOO_EARLY: a collection code can only be generated on the requested date',
        422,
        'A collection code can only be generated on the requested date.',
      ],
      [
        'NO_KEYS_AVAILABLE: every key on this bunch is currently out or reserved (1 of 1)',
        409,
        'No key is available for this room right now. Every key is out or reserved — try again once one is returned.',
      ],
      [
        'CONFLICT: request is not in APPROVED state (current: PENDING_HOD)',
        409,
        'This request is not awaiting collection.',
      ],
    ],
    okRow: {
      request_id: REQUEST_ID,
      code: '123456',
      code_expires_at: '2026-10-13T09:10:00Z',
    },
    okData: {
      request_id: REQUEST_ID,
      code: '123456',
      code_expires_at: '2026-10-13T09:10:00Z',
    },
  },
  {
    name: 'expire',
    handler: expire,
    path: '/api/requests/expire',
    rpc: 'expire_request',
    role: 'REQUESTER',
    // No role gate: the RPC itself refuses anyone but the request's owner.
    noProfile: 'proceeds',
    wrongRole: 'proceeds',
    errors: [
      ['NOT_AUTHENTICATED: no session', 401, 'Not authenticated'],
      [
        `NOT_FOUND: request ${REQUEST_ID} does not exist`,
        404,
        'Request not found',
      ],
      ['FORBIDDEN: not your request', 403, 'This is not your request'],
      [
        'NOT_EXPIRED: the code has not expired yet',
        409,
        'This code has not expired yet.',
      ],
    ],
    okRow: { request_id: REQUEST_ID, status: 'APPROVED' },
    okData: { request_id: REQUEST_ID, status: 'APPROVED' },
  },
  {
    name: 'dismiss',
    handler: dismiss,
    path: '/api/requests/dismiss',
    rpc: 'dismiss_expired_request',
    role: 'DEAN',
    // Was 403 before the route() migration; no profile is unauthenticated.
    noProfile: [401, 'Unauthorized'],
    wrongRole: [403, 'Forbidden'],
    errors: [
      [
        `NOT_FOUND: request ${REQUEST_ID} does not exist`,
        404,
        'Request not found',
      ],
      [
        'FORBIDDEN: request does not belong to your faculty',
        403,
        'This request is not in your faculty.',
      ],
      [
        'CONFLICT: the requested date has not passed yet',
        409,
        'This request is still live — approve or decline it instead.',
      ],
      [
        'CONFLICT: request is not dismissable (current: DECLINED)',
        409,
        'This request can no longer be dismissed.',
      ],
      [
        'CONFLICT: only weekend requests can be dismissed',
        409,
        'This request can no longer be dismissed.',
      ],
    ],
    okRow: { request_id: REQUEST_ID, status: 'EXPIRED' },
    okData: { request_id: REQUEST_ID, status: 'EXPIRED' },
  },
];

describe.each(SIMPLE_ROUTES)('$name', (r) => {
  const send = (body: unknown = { request_id: REQUEST_ID }) =>
    call(r.handler, post(r.path, body));

  beforeEach(() => {
    asRole(r.role);
    fake.rpc[r.rpc] = { data: [r.okRow], error: null };
  });

  it('401s with no session', async () => {
    fake.user = null;
    expect(await send()).toEqual(failure(401, 'Unauthorized'));
    expect(fake.rpcCalls).toEqual([]);
  });

  it('handles a signed-in user with no profile', async () => {
    fake.profile = null;
    const res = await send();
    if (r.noProfile === 'proceeds') {
      expect(res).toEqual(success(r.okData));
    } else {
      expect(res).toEqual(failure(...r.noProfile));
    }
  });

  it('handles the wrong role', async () => {
    asRole(r.role === 'REQUESTER' ? 'VERIFIER' : 'REQUESTER');
    const res = await send();
    if (r.wrongRole === 'proceeds') {
      expect(res).toEqual(success(r.okData));
    } else {
      expect(res).toEqual(failure(...r.wrongRole));
    }
  });

  it.each([['{not json'], [{}], [{ request_id: 'not-a-uuid' }]])(
    '422s a bad body (%j)',
    async (body) => {
      expect(await send(body)).toEqual(failure(422, 'Invalid request body'));
      expect(fake.rpcCalls).toEqual([]);
    }
  );

  it.each(r.errors)('%s → %i', async (raised, status, message) => {
    fake.rpc[r.rpc] = rpcError(raised);
    expect(await send()).toEqual(failure(status, message));
  });

  it('500s an unrecognised failure with a ref', async () => {
    fake.rpc[r.rpc] = rpcError('connection reset');
    expectRef(await send());
  });

  it('returns the RPC row on success', async () => {
    expect(await send()).toEqual(success(r.okData));
  });

  it('acts as the session user', async () => {
    await send({ request_id: REQUEST_ID, requester_id: 'someone-else' });
    expect(fake.rpcCalls).toHaveLength(1);
    expect(Object.values(fake.rpcCalls[0].args as object)).toEqual([
      REQUEST_ID,
      USER_ID,
    ]);
  });
});

describe('empty RPC results', () => {
  it.each([
    ['request-return', requestReturn, 'request_return'],
    ['weekend-code', weekendCode, 'generate_weekend_code'],
  ])('%s 500s with a ref', async (_name, handler, rpc) => {
    asRole('REQUESTER');
    fake.rpc[rpc] = { data: [], error: null };
    expectRef(
      await call(handler, post('/api/requests/x', { request_id: REQUEST_ID }))
    );
  });

  // Unreachable in practice (both RPCs always return a row). Before the
  // route() migration these fabricated success from the request body.
  it.each([
    ['expire', expire, 'expire_request', 'REQUESTER'],
    ['dismiss', dismiss, 'dismiss_expired_request', 'DEAN'],
  ] as const)('%s 500s with a ref', async (_name, handler, rpc, role) => {
    asRole(role);
    fake.rpc[rpc] = { data: [], error: null };
    expectRef(
      await call(handler, post('/api/requests/x', { request_id: REQUEST_ID }))
    );
  });
});

describe('weekend-code — notification', () => {
  it('emails the code after a successful mint, and only then', async () => {
    asRole('REQUESTER');
    fake.rpc.generate_weekend_code = rpcError('TOO_EARLY: not yet');
    await call(
      weekendCode,
      post('/api/requests/weekend-code', { request_id: REQUEST_ID })
    );
    expect(notifyAfterResponse).not.toHaveBeenCalled();

    fake.rpc.generate_weekend_code = {
      data: [{ request_id: REQUEST_ID, code: '1', code_expires_at: 'x' }],
      error: null,
    };
    await call(
      weekendCode,
      post('/api/requests/weekend-code', { request_id: REQUEST_ID })
    );
    expect(notifyAfterResponse).toHaveBeenCalledWith({
      type: 'CODE_ISSUED',
      requestId: REQUEST_ID,
    });
  });
});

// ---------------------------------------------------------------------------
// Routes already on route() (PR #64): pinned so this batch cannot drift them.
// ---------------------------------------------------------------------------

describe('cancel', () => {
  const send = (body: unknown = { request_id: REQUEST_ID }) =>
    call(cancel, post('/api/requests/cancel', body));

  beforeEach(() => {
    asRole('REQUESTER');
    fake.rpc.cancel_request = {
      data: [{ request_id: REQUEST_ID, status: 'CANCELLED' }],
      error: null,
    };
  });

  it.each([
    ['no session', () => (fake.user = null), 401, 'Unauthorized'],
    ['no profile', () => (fake.profile = null), 401, 'Unauthorized'],
    ['wrong role', () => asRole('DEAN'), 403, 'Forbidden'],
  ])('%s → %i', async (_label, arrange, status, message) => {
    arrange();
    expect(await send()).toEqual(failure(status, message));
  });

  it('422s a bad body', async () => {
    expect(await send({})).toEqual(failure(422, 'Invalid request body'));
  });

  it.each([
    [
      'CONFLICT: request cannot be cancelled (current: KEY_ISSUED)',
      409,
      'Request cannot be cancelled in its current state',
    ],
    [`NOT_FOUND: request ${REQUEST_ID} does not exist`, 404, 'Not found'],
    ['FORBIDDEN: not your request', 403, 'Forbidden'],
  ])('%s → %i', async (raised, status, message) => {
    fake.rpc.cancel_request = rpcError(raised);
    expect(await send()).toEqual(failure(status, message));
  });

  it('returns the new status', async () => {
    expect(await send()).toEqual(
      success({ request_id: REQUEST_ID, status: 'CANCELLED' })
    );
  });
});

describe('cso-decision', () => {
  const BODY = { request_id: REQUEST_ID, decision: 'DECLINED' };
  const send = (body: unknown = BODY) =>
    call(csoDecision, post('/api/requests/cso-decision', body));

  beforeEach(() => {
    asRole('CSO');
    fake.rpc.cso_decide_request = {
      data: [{ request_id: REQUEST_ID, status: 'CANCELLED' }],
      error: null,
    };
  });

  it.each([
    ['no session', () => (fake.user = null), 401, 'Unauthorized'],
    ['no profile', () => (fake.profile = null), 401, 'Unauthorized'],
    ['wrong role', () => asRole('DEAN'), 403, 'Forbidden'],
  ])('%s → %i', async (_label, arrange, status, message) => {
    arrange();
    expect(await send()).toEqual(failure(status, message));
  });

  it('422s a bad decision', async () => {
    expect(await send({ request_id: REQUEST_ID, decision: 'MAYBE' })).toEqual(
      failure(422, 'Invalid request body')
    );
  });

  it.each([
    [
      `NOT_FOUND: request ${REQUEST_ID} does not exist`,
      404,
      'Request not found',
    ],
    [
      'CONFLICT: only a request with an uncollected code can be declined',
      409,
      'Only a request whose code has not been collected yet can be declined.',
    ],
    [
      'CONFLICT: request is not under review (current: KEY_RETURNED)',
      409,
      'This request is no longer awaiting review.',
    ],
  ])('%s → %i', async (raised, status, message) => {
    fake.rpc.cso_decide_request = rpcError(raised);
    expect(await send()).toEqual(failure(status, message));
  });

  it('returns the real status', async () => {
    expect(await send()).toEqual(
      success({ request_id: REQUEST_ID, status: 'CANCELLED' })
    );
  });
});

describe('submit', () => {
  const OWN_LETTER = `https://x.supabase.co/storage/v1/object/public/weekend-letters/${USER_ID}/letter.png`;
  const WEEKDAY = {
    key_id: KEY_ID,
    type: 'WEEKDAY',
    return_deadline: '2026-10-13T17:00:00Z',
  };
  const send = (body: unknown = WEEKDAY) =>
    call(submit, post('/api/requests/submit', body));

  beforeEach(() => {
    asRole('REQUESTER');
    fake.rpc.create_request = {
      data: [
        {
          request_id: REQUEST_ID,
          code: '123456',
          code_expires_at: '2026-10-13T09:10:00Z',
        },
      ],
      error: null,
    };
  });

  it.each([
    ['no session', () => (fake.user = null), 401, 'Unauthorized'],
    ['no profile', () => (fake.profile = null), 401, 'Unauthorized'],
    ['wrong role', () => asRole('VERIFIER'), 403, 'Forbidden'],
  ])('%s → %i', async (_label, arrange, status, message) => {
    arrange();
    expect(await send()).toEqual(failure(status, message));
  });

  it('422s a bad body', async () => {
    expect(await send({ ...WEEKDAY, type: 'HOLIDAY' })).toEqual(
      failure(422, 'Invalid request body')
    );
  });

  it("422s a letter outside the requester's own folder", async () => {
    expect(
      await send({
        ...WEEKDAY,
        type: 'WEEKEND',
        weekend_date: '2026-10-17',
        letter_url:
          'https://x.supabase.co/storage/v1/object/public/hod-signatures/dean/sig.png',
      })
    ).toEqual(failure(422, 'Invalid letter or stamp upload'));
    expect(fake.rpcCalls).toEqual([]);
  });

  const WEEKEND_WITH = (extra: Record<string, string>) => ({
    ...WEEKDAY,
    type: 'WEEKEND',
    weekend_date: '2026-10-17',
    ...extra,
  });
  const OWN_STAMP = OWN_LETTER.replace('letter.png', 'stamp.png');

  it('reads a weekend letter and stamp back from storage before creating', async () => {
    expect(
      (
        await send(
          WEEKEND_WITH({ letter_url: OWN_LETTER, stamp_url: OWN_STAMP })
        )
      ).status
    ).toBe(201);
    expect(fake.downloadCalls).toEqual([
      { bucket: 'weekend-letters', path: `${USER_ID}/letter.png` },
      { bucket: 'weekend-letters', path: `${USER_ID}/stamp.png` },
    ]);
  });

  it.each([
    ['an SVG', '<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'],
    ['an HTML page', '<!doctype html><script>alert(1)</script>'],
    ['a PDF', '%PDF-1.7\n'],
  ])('422s a stored letter that is really %s', async (_label, body) => {
    fake.downloads[`${USER_ID}/letter.png`] = {
      data: new Blob([body]),
      error: null,
    };
    expect(await send(WEEKEND_WITH({ letter_url: OWN_LETTER }))).toEqual(
      failure(422, 'Invalid letter or stamp upload')
    );
    expect(fake.rpcCalls).toEqual([]);
  });

  it('422s a stamp that is not in storage', async () => {
    fake.downloads[`${USER_ID}/stamp.png`] = {
      data: null,
      error: { message: 'Object not found' },
    };
    expect(
      await send(WEEKEND_WITH({ letter_url: OWN_LETTER, stamp_url: OWN_STAMP }))
    ).toEqual(failure(422, 'Invalid letter or stamp upload'));
    expect(fake.rpcCalls).toEqual([]);
  });

  it('does not read back a letter sent with a weekday request', async () => {
    expect((await send({ ...WEEKDAY, letter_url: OWN_LETTER })).status).toBe(
      201
    );
    expect(fake.downloadCalls).toEqual([]);
  });

  it.each([
    ['NOT_AUTHENTICATED', 401, 'Not authenticated'],
    [
      'NOT_AUTHORISED: requester is not whitelisted for this key',
      403,
      'Not authorised for this key',
    ],
    [
      'CONFLICT: an active request already exists for this key',
      409,
      'Active request exists for this key. Cancel it or wait for the key to be returned.',
    ],
    [
      'NO_KEYS_AVAILABLE: every key on this bunch is currently out or reserved (1 of 1)',
      409,
      'No key is available for this room right now. Every key is out or reserved — try again once one is returned.',
    ],
    [
      'VALIDATION: a letter is only accepted on a weekend request',
      422,
      'Invalid letter or stamp upload',
    ],
  ])('%s → %i', async (raised, status, message) => {
    fake.rpc.create_request = rpcError(raised);
    expect(await send()).toEqual(failure(status, message));
  });

  // CHANGED: create_request is service-only (20261015090000_grant_hardening),
  // so the route calls it through the admin client and names the requester.
  it('calls create_request as service_role with the session user as requester', async () => {
    expect((await send()).status).toBe(201);
    expect(fake.rpcClients).toEqual([
      { name: 'create_request', client: 'admin' },
    ]);
    expect(fake.rpcCalls[0].args).toMatchObject({
      p_requester_id: USER_ID,
      p_key_id: KEY_ID,
    });
  });

  it('201s a weekday request with its code', async () => {
    expect(await send()).toEqual(
      success(
        {
          request_id: REQUEST_ID,
          code: '123456',
          code_expires_at: '2026-10-13T09:10:00Z',
          risk_tier: expect.any(String),
        },
        201
      )
    );
    expect(notifyAfterResponse).toHaveBeenCalledWith({
      type: 'CODE_ISSUED',
      requestId: REQUEST_ID,
    });
  });

  it('201s a weekend request as PENDING_HOD', async () => {
    expect(
      await send({
        ...WEEKDAY,
        type: 'WEEKEND',
        weekend_date: '2026-10-17',
        letter_url: OWN_LETTER,
      })
    ).toEqual(
      success(
        {
          request_id: REQUEST_ID,
          status: 'PENDING_HOD',
          risk_tier: expect.any(String),
        },
        201
      )
    );
    expect(notifyAfterResponse).toHaveBeenCalledWith({
      type: 'WEEKEND_SUBMITTED',
      requestId: REQUEST_ID,
    });
  });
});
