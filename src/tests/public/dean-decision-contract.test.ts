// @vitest-environment node
// Contract for the emailed one-click Dean decision routes. GET is the
// confirmation page's read and must never mutate (mail scanners prefetch
// every link); POST resolves the unit's current Dean and hands off to
// decideWeekend, whose outcomes it maps unchanged. decideWeekend itself is
// covered by its own tests, so it is mocked here; rejectionToHttp is real.
// Written against the routes before they moved onto route(); kept as the
// regression net after.
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  GET,
  POST,
} from '@/app/api/public/dean-decision/[token]/route';
import { logger } from '@/lib/logger';
import {
  decideWeekend,
  rejectionToHttp,
  type WeekendDecisionRejection,
} from '@/lib/requests/decide-weekend';

import {
  DEAN_ID,
  KEY_ID,
  REF_PATTERN,
  REQUEST_ID,
  TOKEN,
  UNIT_ID,
  call,
  failure,
  fake,
  get,
  post,
  resetFake,
  success,
  type Op,
} from './route-harness';

vi.mock('@/lib/supabase/admin', async () => {
  const h = await import('./route-harness');
  return { createAdminClient: () => h.makeAdminClient() };
});
vi.mock('@/lib/requests/decide-weekend', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/requests/decide-weekend')>();
  return { ...actual, decideWeekend: vi.fn() };
});

// The fixtures request Saturday 2026-10-17; pin "today" to the Tuesday before
// so the link is still decidable whatever day the suite runs.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-13T10:00:00Z'));
});
afterAll(() => {
  vi.useRealTimers();
});

const LETTER_URL =
  'https://project.supabase.co/storage/v1/object/public/weekend-letters/u1/letter.png';
const STAMP_URL =
  'https://project.supabase.co/storage/v1/object/public/weekend-letters/u1/stamp.png';

const REGISTERED_ROW = {
  id: REQUEST_ID,
  status: 'PENDING_HOD',
  requested_for: '2026-10-17',
  key_id: KEY_ID,
  letter_url: LETTER_URL,
  stamp_url: null,
  guest_id: null,
  requested_unit_id: null,
  requested_room: null,
  requester: { full_name: 'Dr. Bakare' },
  key: { code: 'NS-304', room_name: 'Senate Hall A' },
  guest: null,
};

const GUEST_ROW = {
  id: REQUEST_ID,
  status: 'PENDING_HOD',
  requested_for: '2026-10-17',
  key_id: null,
  letter_url: LETTER_URL,
  stamp_url: STAMP_URL,
  guest_id: 'guest-1',
  requested_unit_id: UNIT_ID,
  requested_room: 'Senate Hall A',
  requester: null,
  key: null,
  guest: {
    full_name: 'Jane Doe',
    id_document_type: 'National ID',
    id_document_number: 'A1234567',
    phone: null,
  },
};

const AVAILABLE_KEYS = [
  { id: KEY_ID, code: 'NS-304', room_name: 'Senate Hall A' },
];

const isUnitKeysQuery = (ops: Op[]) =>
  ops.some(([m, args]) => m === 'eq' && args[0] === 'unit_id');

const expectRef = (res: Awaited<ReturnType<typeof call>>) => {
  expect(res.status).toBe(500);
  expect(res.body).toMatchObject({ data: null, status: 500 });
  expect(res.body.error).toMatch(REF_PATTERN);
};

beforeEach(() => {
  resetFake();
  vi.mocked(decideWeekend).mockReset();
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
  fake.tables.keys = (ops) =>
    isUnitKeysQuery(ops)
      ? { data: AVAILABLE_KEYS, error: null }
      : { data: { unit_id: UNIT_ID }, error: null };
  fake.tables.units = {
    data: { authoriser: 'DEAN', hod_id: DEAN_ID },
    error: null,
  };
});

// ---------------------------------------------------------------------------
// GET — read only
// ---------------------------------------------------------------------------

describe('GET /api/public/dean-decision/[token]', () => {
  const read = (token = TOKEN) =>
    call(GET, get(`/api/public/dean-decision/${token}`), { token });

  const expectNoMutation = () => {
    expect(fake.rpcCalls).toHaveLength(0);
    expect(fake.uploads).toHaveLength(0);
    expect(decideWeekend).not.toHaveBeenCalled();
  };

  it('404 for a malformed token, without a query', async () => {
    expect(await read('nope')).toEqual(failure(404, 'Request not found'));
    expect(fake.queries).toHaveLength(0);
  });

  it('404 for an unknown token', async () => {
    fake.tables.requests = { data: null, error: null };
    expect(await read()).toEqual(failure(404, 'Request not found'));
    expectNoMutation();
  });

  it('500 with a ref when the lookup fails', async () => {
    fake.tables.requests = { data: null, error: { message: 'boom' } };
    const res = await read();
    expectRef(res);
    expect(res.body.error).not.toContain('boom');
  });

  it('looks the request up by decision_token', async () => {
    fake.tables.requests = { data: REGISTERED_ROW, error: null };
    await read();
    expect(fake.queries[0].table).toBe('requests');
    expect(fake.queries[0].ops).toContainEqual([
      'eq',
      ['decision_token', TOKEN],
    ]);
  });

  it('registered request: shape, signed letter, no key picker', async () => {
    fake.tables.requests = { data: REGISTERED_ROW, error: null };
    const res = await read();
    expect(res).toEqual(
      success({
        request_id: REQUEST_ID,
        status: 'PENDING_HOD',
        decidable: true,
        is_guest: false,
        requested_for: '2026-10-17',
        requester_name: 'Dr. Bakare',
        requested_room: null,
        id_document_type: null,
        id_document_number: null,
        key: { code: 'NS-304', room_name: 'Senate Hall A' },
        available_keys: [],
        letter_url: 'https://signed.example/u1/letter.png',
        stamp_url: null,
      })
    );
    expect(fake.signCalls).toEqual([
      { bucket: 'weekend-letters', path: 'u1/letter.png', ttl: 300 },
    ]);
    expect(fake.queries.map((q) => q.table)).toEqual(['requests']);
    expectNoMutation();
  });

  it('guest request: guest details and the unit key picker', async () => {
    fake.tables.requests = { data: GUEST_ROW, error: null };
    const res = await read();
    expect(res).toEqual(
      success({
        request_id: REQUEST_ID,
        status: 'PENDING_HOD',
        decidable: true,
        is_guest: true,
        requested_for: '2026-10-17',
        requester_name: 'Jane Doe',
        requested_room: 'Senate Hall A',
        id_document_type: 'National ID',
        // Masked on this no-login page (2026-10-13); full on the dashboard.
        id_document_number: '•••• 4567',
        key: null,
        available_keys: AVAILABLE_KEYS,
        letter_url: 'https://signed.example/u1/letter.png',
        stamp_url: 'https://signed.example/u1/stamp.png',
      })
    );
    const keysQuery = fake.queries.find((q) => q.table === 'keys');
    expect(keysQuery?.ops).toEqual(
      expect.arrayContaining([
        ['eq', ['unit_id', UNIT_ID]],
        ['neq', ['status', 'RETIRED']],
      ])
    );
    expectNoMutation();
  });

  it('decided guest request: not decidable, no key picker', async () => {
    fake.tables.requests = {
      data: { ...GUEST_ROW, status: 'APPROVED' },
      error: null,
    };
    const res = await read();
    expect(res.body.data).toMatchObject({
      status: 'APPROVED',
      decidable: false,
      available_keys: [],
    });
    expect(fake.queries.some((q) => q.table === 'keys')).toBe(false);
  });

  it('date passed: still pending but not decidable, and nothing sensitive is returned', async () => {
    vi.setSystemTime(new Date('2026-10-18T10:00:00Z'));
    try {
      fake.tables.requests = { data: GUEST_ROW, error: null };
      const res = await read();
      expect(res.body.data).toMatchObject({
        status: 'PENDING_HOD',
        decidable: false,
        id_document_type: null,
        id_document_number: null,
        letter_url: null,
        stamp_url: null,
        available_keys: [],
      });
      expect(fake.signCalls).toHaveLength(0);
      expectNoMutation();
    } finally {
      vi.setSystemTime(new Date('2026-10-13T10:00:00Z'));
    }
  });

  it('decided request: the letter is not signed and no ID details are returned', async () => {
    fake.tables.requests = {
      data: { ...GUEST_ROW, status: 'DECLINED' },
      error: null,
    };
    const res = await read();
    expect(res.body.data).toMatchObject({
      decidable: false,
      id_document_number: null,
      letter_url: null,
      stamp_url: null,
    });
    expect(fake.signCalls).toHaveLength(0);
  });

  it('a letter outside weekend-letters is not signed', async () => {
    fake.tables.requests = {
      data: {
        ...REGISTERED_ROW,
        letter_url:
          'https://project.supabase.co/storage/v1/object/public/hod-signatures/x/sig.png',
      },
      error: null,
    };
    const res = await read();
    expect(res.body.data.letter_url).toBeNull();
    expect(fake.signCalls).toHaveLength(0);
  });

  it('a failed signing yields a null url, not an error', async () => {
    fake.tables.requests = { data: REGISTERED_ROW, error: null };
    fake.signedUrl = () => ({ data: null, error: { message: 'nope' } });
    const res = await read();
    expect(res.status).toBe(200);
    expect(res.body.data.letter_url).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// POST — the decision
// ---------------------------------------------------------------------------

describe('POST /api/public/dean-decision/[token]', () => {
  const decide = (body: unknown, token = TOKEN) =>
    call(POST, post(`/api/public/dean-decision/${token}`, body), { token });

  beforeEach(() => {
    fake.tables.requests = { data: REGISTERED_ROW, error: null };
  });

  it('404 for a malformed token, checked before the body', async () => {
    expect(await decide('not json', 'nope')).toEqual(
      failure(404, 'Request not found')
    );
    expect(fake.queries).toHaveLength(0);
  });

  it.each([
    ['unparseable JSON', 'not json'],
    ['missing decision', {}],
    ['unknown decision', { decision: 'MAYBE' }],
    ['non-uuid key_id', { decision: 'APPROVED', key_id: 'k1' }],
  ])('422 Invalid request body: %s', async (_label, body) => {
    expect(await decide(body)).toEqual(failure(422, 'Invalid request body'));
    expect(fake.queries).toHaveLength(0);
  });

  it('500 with a ref when the lookup fails', async () => {
    fake.tables.requests = { data: null, error: { message: 'boom' } };
    expectRef(await decide({ decision: 'APPROVED' }));
    expect(decideWeekend).not.toHaveBeenCalled();
  });

  it('404 for an unknown token', async () => {
    fake.tables.requests = { data: null, error: null };
    expect(await decide({ decision: 'APPROVED' })).toEqual(
      failure(404, 'Request not found')
    );
  });

  it('409 when the request is no longer PENDING_HOD', async () => {
    fake.tables.requests = {
      data: { ...REGISTERED_ROW, status: 'APPROVED' },
      error: null,
    };
    expect(await decide({ decision: 'DECLINED' })).toEqual(
      failure(409, 'This request has already been decided.')
    );
    expect(decideWeekend).not.toHaveBeenCalled();
  });

  it('409 once the requested date has passed, without deciding', async () => {
    vi.setSystemTime(new Date('2026-10-18T10:00:00Z'));
    try {
      expect(await decide({ decision: 'APPROVED' })).toEqual(
        failure(
          409,
          'The requested date has passed, so this request can no longer be decided.'
        )
      );
      expect(decideWeekend).not.toHaveBeenCalled();
    } finally {
      vi.setSystemTime(new Date('2026-10-13T10:00:00Z'));
    }
  });

  it('404 when a registered request resolves to no unit', async () => {
    fake.tables.requests = {
      data: { ...REGISTERED_ROW, key_id: null },
      error: null,
    };
    expect(await decide({ decision: 'APPROVED' })).toEqual(
      failure(404, 'Request not found')
    );
  });

  it('404 when the key row has vanished', async () => {
    fake.tables.keys = { data: null, error: { message: 'no rows' } };
    expect(await decide({ decision: 'APPROVED' })).toEqual(
      failure(404, 'Request not found')
    );
  });

  it.each([
    ['unit missing', null],
    ['CSO-authorised unit', { authoriser: 'CSO', hod_id: DEAN_ID }],
    ['unit with no Dean', { authoriser: 'DEAN', hod_id: null }],
  ])('403 when %s', async (_label, unit) => {
    fake.tables.units = { data: unit, error: null };
    expect(await decide({ decision: 'APPROVED' })).toEqual(
      failure(403, 'This request can no longer be decided by email.')
    );
    expect(decideWeekend).not.toHaveBeenCalled();
  });

  it('decides as the unit’s current Dean (registered: unit from the key)', async () => {
    vi.mocked(decideWeekend).mockResolvedValue({
      outcome: 'APPROVED',
      requestId: REQUEST_ID,
    });
    const res = await decide({ decision: 'APPROVED', note: 'ok' });
    expect(res).toEqual(
      success({ request_id: REQUEST_ID, status: 'APPROVED' })
    );
    expect(decideWeekend).toHaveBeenCalledWith({
      requestId: REQUEST_ID,
      actorId: DEAN_ID,
      decision: 'APPROVED',
      note: 'ok',
      keyId: undefined,
    });
    const keysQuery = fake.queries.find((q) => q.table === 'keys');
    expect(keysQuery?.ops).toContainEqual(['eq', ['id', KEY_ID]]);
    const unitsQuery = fake.queries.find((q) => q.table === 'units');
    expect(unitsQuery?.ops).toContainEqual(['eq', ['id', UNIT_ID]]);
  });

  it('guest: unit from requested_unit_id, key_id passed through', async () => {
    fake.tables.requests = { data: GUEST_ROW, error: null };
    vi.mocked(decideWeekend).mockResolvedValue({
      outcome: 'APPROVED',
      requestId: REQUEST_ID,
    });
    await decide({ decision: 'APPROVED', key_id: KEY_ID });
    expect(fake.queries.some((q) => q.table === 'keys')).toBe(false);
    expect(decideWeekend).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: DEAN_ID, keyId: KEY_ID })
    );
  });

  it('200 DECLINED', async () => {
    vi.mocked(decideWeekend).mockResolvedValue({
      outcome: 'DECLINED',
      requestId: REQUEST_ID,
    });
    expect(await decide({ decision: 'DECLINED' })).toEqual(
      success({ request_id: REQUEST_ID, status: 'DECLINED' })
    );
  });

  it('200 HELD_SIGNATURE_MISMATCH with its own copy', async () => {
    vi.mocked(decideWeekend).mockResolvedValue({
      outcome: 'HELD',
      requestId: REQUEST_ID,
      mismatches: { signature: 72.5 },
    });
    expect(await decide({ decision: 'APPROVED' })).toEqual(
      success({
        request_id: REQUEST_ID,
        status: 'HELD_SIGNATURE_MISMATCH',
        mismatches: { signature: 72.5 },
        message:
          'This approval has been held for review — the submitted signature or stamp did not match. The CSO has been notified.',
      })
    );
  });

  const REASONS: WeekendDecisionRejection[] = [
    'NOT_FOUND',
    'ALREADY_DECIDED',
    'DATE_PASSED',
    'NOT_AUTHORISER',
    'NO_MISMATCH_TO_OVERRIDE',
    'KEY_REQUIRED',
    'ONBOARDING_INCOMPLETE',
    'INVALID_SUBMISSION',
  ];

  it.each(REASONS)('REJECTED %s maps through rejectionToHttp', async (reason) => {
    vi.mocked(decideWeekend).mockResolvedValue({
      outcome: 'REJECTED',
      reason,
    });
    const { status, message } = rejectionToHttp(reason);
    expect(await decide({ decision: 'APPROVED' })).toEqual(
      failure(status, message)
    );
  });

  it('REJECTED INTERNAL carries its ref', async () => {
    const ref = '77777777-7777-4777-8777-777777777777';
    vi.mocked(decideWeekend).mockResolvedValue({
      outcome: 'REJECTED',
      reason: 'INTERNAL',
      ref,
    });
    expect(await decide({ decision: 'APPROVED' })).toEqual(
      failure(500, `Internal error. Ref: ${ref}`)
    );
  });
});

// ---------------------------------------------------------------------------
// Uncaught throws
//
// Behaviour change (route() migration): these used to reject, which Next
// turned into a bare, unenveloped 500. route() now catches the throw and
// answers an enveloped 500 with a ref, never the thrown text.
// ---------------------------------------------------------------------------

describe('uncaught throws', () => {
  it('GET: enveloped 500 when the admin client cannot be built', async () => {
    fake.adminThrows = new Error('supabaseKey is required');
    const res = await call(GET, get(`/api/public/dean-decision/${TOKEN}`), {
      token: TOKEN,
    });
    expectRef(res);
    expect(res.body.error).not.toContain('supabaseKey');
  });

  it('POST: enveloped 500 when decideWeekend throws', async () => {
    fake.tables.requests = { data: REGISTERED_ROW, error: null };
    vi.mocked(decideWeekend).mockRejectedValue(new Error('storage down'));
    const res = await call(
      POST,
      post(`/api/public/dean-decision/${TOKEN}`, { decision: 'APPROVED' }),
      { token: TOKEN }
    );
    expectRef(res);
    expect(res.body.error).not.toContain('storage');
  });
});
