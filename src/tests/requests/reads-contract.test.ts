// @vitest-environment node
// Contract for the requests/* read routes: auth outcomes, query errors and
// success shapes. Written against the routes before they moved onto route();
// kept as the regression net afterwards.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as letter } from '@/app/api/requests/[id]/letter/route';
import { GET as csoQueue } from '@/app/api/requests/cso-queue/route';
import { GET as liveQueue } from '@/app/api/requests/live-queue/route';
import { GET as my } from '@/app/api/requests/my/route';
import { GET as pending } from '@/app/api/requests/pending/route';
import { logger } from '@/lib/logger';

import {
  REF_PATTERN,
  REQUEST_ID,
  USER_ID,
  call,
  failure,
  fake,
  get,
  resetFake,
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

type Role = 'CSO' | 'DEAN' | 'VERIFIER' | 'REQUESTER';

const asRole = (role: Role, unit_id: string | null = 'unit-1') => {
  fake.profile = { role, unit_id, full_name: 'Test User' };
};

const QUERY_FAILED = { data: null, error: { message: 'relation exploded' } };

const expectRef = (res: { status: number; body: { error: string } }) => {
  expect(res.status).toBe(500);
  expect(res.body).toMatchObject({ data: null, status: 500 });
  expect(res.body.error).toMatch(REF_PATTERN);
};

beforeEach(() => {
  resetFake();
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);
});

// ---------------------------------------------------------------------------
// Auth outcomes, shared shape.
// ---------------------------------------------------------------------------

type AuthCase = {
  name: string;
  send: () => ReturnType<typeof call>;
  role: Role;
  wrongRole: Role;
  noProfile: [number, string];
};

const AUTH_CASES: AuthCase[] = [
  {
    name: 'my',
    send: () => call(my, get('/api/requests/my')),
    role: 'REQUESTER',
    wrongRole: 'DEAN',
    noProfile: [401, 'Unauthorized'],
  },
  {
    name: 'pending',
    send: () => call(pending, get('/api/requests/pending')),
    role: 'DEAN',
    wrongRole: 'REQUESTER',
    noProfile: [403, 'Forbidden'],
  },
  {
    name: 'cso-queue',
    send: () => call(csoQueue, get('/api/requests/cso-queue')),
    role: 'CSO',
    wrongRole: 'DEAN',
    noProfile: [401, 'Unauthorized'],
  },
  {
    name: 'live-queue',
    send: () => call(liveQueue, get('/api/requests/live-queue')),
    role: 'VERIFIER',
    wrongRole: 'REQUESTER',
    noProfile: [401, 'Unauthorized'],
  },
  {
    name: 'letter',
    send: () =>
      call(letter, get(`/api/requests/${REQUEST_ID}/letter`), {
        id: REQUEST_ID,
      }),
    role: 'DEAN',
    wrongRole: 'VERIFIER',
    noProfile: [403, 'Forbidden'],
  },
];

describe.each(AUTH_CASES)('$name — auth', (c) => {
  it('401s with no session', async () => {
    fake.user = null;
    expect(await c.send()).toEqual(failure(401, 'Unauthorized'));
  });

  it('handles a signed-in user with no profile', async () => {
    fake.profile = null;
    expect(await c.send()).toEqual(failure(...c.noProfile));
  });

  it('403s the wrong role', async () => {
    asRole(c.wrongRole);
    expect(await c.send()).toEqual(failure(403, 'Forbidden'));
  });
});

// ---------------------------------------------------------------------------
// GET /api/requests/my
// ---------------------------------------------------------------------------

describe('my', () => {
  const ROWS = [
    { id: 'r3', created_at: '2026-10-13T09:00:00Z' },
    { id: 'r2', created_at: '2026-10-12T09:00:00Z' },
    { id: 'r1', created_at: '2026-10-11T09:00:00Z' },
  ];

  beforeEach(() => {
    asRole('REQUESTER');
    fake.tables.requests = { data: ROWS, error: null };
  });

  const ops = () => fake.queries.find((q) => q.table === 'requests')?.ops;

  it("returns the caller's requests with no cursor when there are no more", async () => {
    expect(await call(my, get('/api/requests/my'))).toEqual(
      success({ requests: ROWS, next_cursor: null })
    );
    expect(ops()).toContainEqual(['eq', ['requester_id', USER_ID]]);
    expect(ops()).toContainEqual(['limit', [21]]);
  });

  it('pages: returns `limit` rows and a base64 cursor of the last', async () => {
    const res = await call(my, get('/api/requests/my?limit=2'));
    expect(res).toEqual(
      success({
        requests: ROWS.slice(0, 2),
        next_cursor: Buffer.from(ROWS[1].created_at).toString('base64'),
      })
    );
    expect(ops()).toContainEqual(['limit', [3]]);
  });

  it('caps the limit at 50', async () => {
    await call(my, get('/api/requests/my?limit=500'));
    expect(ops()).toContainEqual(['limit', [51]]);
  });

  it('applies the status filter and decodes the cursor', async () => {
    const cursor = Buffer.from('2026-10-12T09:00:00Z').toString('base64');
    await call(
      my,
      get(`/api/requests/my?status=KEY_ISSUED,KEY_RETURNED&cursor=${cursor}`)
    );
    expect(ops()).toContainEqual([
      'in',
      ['status', ['KEY_ISSUED', 'KEY_RETURNED']],
    ]);
    expect(ops()).toContainEqual([
      'lt',
      ['created_at', '2026-10-12T09:00:00Z'],
    ]);
  });

  it('500s a query failure with a ref', async () => {
    fake.tables.requests = QUERY_FAILED;
    expectRef(await call(my, get('/api/requests/my')));
  });
});

// ---------------------------------------------------------------------------
// GET /api/requests/pending
// ---------------------------------------------------------------------------

describe('pending', () => {
  const unit = (id: string, authoriser: 'DEAN' | 'CSO') => ({
    id,
    name: id,
    authoriser,
  });
  const OWN_KEY = {
    id: 'a',
    key: { department: unit('unit-1', 'DEAN') },
    requested_department: null,
  };
  const OWN_GUEST = {
    id: 'b',
    key: null,
    requested_department: unit('unit-1', 'DEAN'),
  };
  const OTHER_FACULTY = {
    id: 'c',
    key: { department: unit('unit-2', 'DEAN') },
    requested_department: null,
  };
  const ADMIN_KEY = {
    id: 'd',
    key: { department: unit('admin', 'CSO') },
    requested_department: null,
  };
  const ADMIN_GUEST = {
    id: 'e',
    key: null,
    requested_department: unit('admin', 'CSO'),
  };
  const ALL = [OWN_KEY, OWN_GUEST, OTHER_FACULTY, ADMIN_KEY, ADMIN_GUEST];

  beforeEach(() => {
    fake.tables.requests = { data: ALL, error: null };
  });

  it("gives a Dean their own faculty's requests, keyed or guest", async () => {
    asRole('DEAN', 'unit-1');
    expect(await call(pending, get('/api/requests/pending'))).toEqual(
      success({ requests: [OWN_KEY, OWN_GUEST] })
    );
  });

  it('gives the CSO the Administration-routed requests', async () => {
    asRole('CSO', null);
    expect(await call(pending, get('/api/requests/pending'))).toEqual(
      success({ requests: [ADMIN_KEY, ADMIN_GUEST] })
    );
  });

  it('reads only PENDING_HOD through the session client', async () => {
    asRole('DEAN');
    await call(pending, get('/api/requests/pending'));
    const q = fake.queries.find((x) => x.table === 'requests');
    expect(q?.client).toBe('server');
    expect(q?.ops).toContainEqual(['eq', ['status', 'PENDING_HOD']]);
  });

  it('500s a query failure with a ref', async () => {
    asRole('DEAN');
    fake.tables.requests = QUERY_FAILED;
    expectRef(await call(pending, get('/api/requests/pending')));
  });
});

// ---------------------------------------------------------------------------
// GET /api/requests/cso-queue
// ---------------------------------------------------------------------------

describe('cso-queue', () => {
  beforeEach(() => asRole('CSO', null));

  it('returns high-risk issued requests from the last 24 hours', async () => {
    fake.tables.requests = { data: [{ id: 'r1' }], error: null };
    expect(await call(csoQueue, get('/api/requests/cso-queue'))).toEqual(
      success({ requests: [{ id: 'r1' }] })
    );
    const q = fake.queries.find((x) => x.table === 'requests');
    expect(q?.ops).toContainEqual(['eq', ['risk_tier', 'HIGH']]);
    expect(q?.ops).toContainEqual([
      'in',
      ['status', ['CODE_ISSUED', 'KEY_ISSUED']],
    ]);
  });

  it('500s a query failure with a ref', async () => {
    fake.tables.requests = QUERY_FAILED;
    expectRef(await call(csoQueue, get('/api/requests/cso-queue')));
  });
});

// ---------------------------------------------------------------------------
// GET /api/requests/live-queue
// ---------------------------------------------------------------------------

describe('live-queue', () => {
  beforeEach(() => asRole('VERIFIER', null));

  it('returns the CODE_ISSUED queue via the admin client', async () => {
    fake.tables.requests = { data: [{ id: 'r1' }], error: null };
    expect(await call(liveQueue, get('/api/requests/live-queue'))).toEqual(
      success({ requests: [{ id: 'r1' }] })
    );
    const q = fake.queries.find((x) => x.table === 'requests');
    expect(q?.client).toBe('admin');
    expect(q?.ops).toContainEqual(['eq', ['status', 'CODE_ISSUED']]);
  });

  it('returns one request for ?id=', async () => {
    fake.tables.requests = { data: { id: 'r9' }, error: null };
    expect(
      await call(liveQueue, get('/api/requests/live-queue?id=r9'))
    ).toEqual(success({ request: { id: 'r9' } }));
    const q = fake.queries.find((x) => x.table === 'requests');
    expect(q?.ops).toContainEqual(['eq', ['id', 'r9']]);
  });

  it('returns a null request for an id no longer in the queue', async () => {
    fake.tables.requests = { data: null, error: null };
    expect(
      await call(liveQueue, get('/api/requests/live-queue?id=gone'))
    ).toEqual(success({ request: null }));
  });

  it.each([['/api/requests/live-queue'], ['/api/requests/live-queue?id=r9']])(
    '500s a query failure with a ref (%s)',
    async (path) => {
      fake.tables.requests = QUERY_FAILED;
      expectRef(await call(liveQueue, get(path)));
    }
  );
});

// ---------------------------------------------------------------------------
// GET /api/requests/[id]/letter
// ---------------------------------------------------------------------------

describe('letter', () => {
  const STORED = (name: string) =>
    `https://x.supabase.co/storage/v1/object/public/weekend-letters/${USER_ID}/${name}`;
  const ROW = {
    letter_url: STORED('letter.png'),
    stamp_url: STORED('stamp.png'),
    requested_unit_id: null as string | null,
  };

  const send = (query = '') =>
    call(letter, get(`/api/requests/${REQUEST_ID}/letter${query}`), {
      id: REQUEST_ID,
    });

  beforeEach(() => {
    asRole('DEAN', 'unit-1');
    fake.tables.requests = { data: ROW, error: null };
  });

  it('signs the letter for 5 minutes', async () => {
    expect(await send()).toEqual(
      success({ url: 'https://signed.example/letter' })
    );
    expect(fake.signCalls).toEqual([
      {
        bucket: 'weekend-letters',
        path: `${USER_ID}/letter.png`,
        ttl: 300,
      },
    ]);
  });

  it('signs the stamp for ?type=stamp', async () => {
    await send('?type=stamp');
    expect(fake.signCalls[0].path).toBe(`${USER_ID}/stamp.png`);
  });

  it('reads through RLS for a Dean and the admin client for the CSO', async () => {
    await send();
    expect(fake.queries.find((q) => q.table === 'requests')?.client).toBe(
      'server'
    );
    resetFake();
    asRole('CSO', null);
    fake.tables.requests = { data: ROW, error: null };
    await send();
    expect(fake.queries.find((q) => q.table === 'requests')?.client).toBe(
      'admin'
    );
  });

  it.each([
    ['', 'letter_url', 'Letter not found'],
    ['?type=stamp', 'stamp_url', 'Stamp not found'],
  ])('404s a missing file (%s)', async (query, column, message) => {
    fake.tables.requests = { data: { ...ROW, [column]: null }, error: null };
    expect(await send(query)).toEqual(failure(404, message));
  });

  it('404s an unknown request', async () => {
    fake.tables.requests = { data: null, error: null };
    expect(await send()).toEqual(failure(404, 'Letter not found'));
  });

  it("403s a Dean on another faculty's guest request", async () => {
    fake.tables.requests = {
      data: { ...ROW, requested_unit_id: 'unit-2' },
      error: null,
    };
    expect(await send()).toEqual(failure(403, 'Forbidden'));
  });

  it('500s a stored URL outside weekend-letters', async () => {
    fake.tables.requests = {
      data: { ...ROW, letter_url: 'https://elsewhere.example/x.png' },
      error: null,
    };
    expectRef(await send());
  });

  it('500s a signing failure', async () => {
    fake.signedUrl = { data: null, error: { message: 'storage down' } };
    expectRef(await send());
  });
});
