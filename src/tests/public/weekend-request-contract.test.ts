// @vitest-environment node
// Contract for the session-less guest weekend-request routes: submit, the
// status read, and the three token-keyed actions (code, return-code,
// expire). Pins the status and message of every branch and every RPC error
// kind each route maps, malformed and unknown tokens, and success shapes.
// Written against the routes before they moved onto route(); kept as the
// regression net after.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as submit } from '@/app/api/public/weekend-request/route';
import { POST as expire } from '@/app/api/public/weekend-request/[token]/expire/route';
import { POST as returnCode } from '@/app/api/public/weekend-request/[token]/return-code/route';
import { GET as status } from '@/app/api/public/weekend-request/[token]/route';
import { POST as code } from '@/app/api/public/weekend-request/[token]/code/route';
import { logger } from '@/lib/logger';
import { notifyAfterResponse } from '@/lib/notifications/notify';

import {
  REF_PATTERN,
  REQUEST_ID,
  TOKEN,
  UNIT_ID,
  call,
  failure,
  fake,
  get,
  post,
  postForm,
  resetFake,
  rpcError,
  success,
} from './route-harness';

vi.mock('@/lib/supabase/admin', async () => {
  const h = await import('./route-harness');
  return { createAdminClient: () => h.makeAdminClient() };
});
vi.mock('@/lib/notifications/notify', () => ({
  notifyAfterResponse: vi.fn(),
}));

beforeEach(() => {
  resetFake();
  vi.mocked(notifyAfterResponse).mockClear();
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
});

const expectRef = (res: Awaited<ReturnType<typeof call>>) => {
  expect(res.status).toBe(500);
  expect(res.body).toMatchObject({ data: null, status: 500 });
  expect(res.body.error).toMatch(REF_PATTERN);
};

// ---------------------------------------------------------------------------
// POST /api/public/weekend-request (multipart)
// ---------------------------------------------------------------------------

describe('POST /api/public/weekend-request', () => {
  const SATURDAY = '2026-10-17';
  const WEDNESDAY = '2026-10-14';

  const fields = (overrides: Record<string, string | null> = {}) => {
    const values: Record<string, string | null> = {
      full_name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '08012345678',
      id_document_type: 'National ID',
      id_document_number: 'A1234567',
      requested_room: 'Senate Hall A',
      department_id: UNIT_ID,
      weekend_date: SATURDAY,
      return_deadline: '2026-10-17T17:00:00+01:00',
      ...overrides,
    };
    const form = new FormData();
    for (const [k, v] of Object.entries(values)) {
      if (v !== null) form.set(k, v);
    }
    return form;
  };

  const letter = (
    name = 'letter.pdf',
    type = 'application/pdf',
    size = 1024
  ) => new File([new Uint8Array(size)], name, { type });

  const formWith = (
    overrides: Record<string, string | null> = {},
    file: File | null = letter()
  ) => {
    const form = fields(overrides);
    if (file) form.set('letter', file);
    return form;
  };

  const submitForm = (form: FormData) =>
    call(submit, postForm('/api/public/weekend-request', form));

  const OK_ROW = { request_id: REQUEST_ID, access_token: TOKEN };

  beforeEach(() => {
    fake.rpc.create_guest_weekend_request = { data: [OK_ROW], error: null };
  });

  it('422 when the body is not multipart', async () => {
    const res = await call(
      submit,
      post('/api/public/weekend-request', { full_name: 'x' })
    );
    expect(res).toEqual(failure(422, 'Expected multipart/form-data'));
  });

  it.each([
    ['missing full_name', { full_name: null }],
    ['bad email', { email: 'nope' }],
    ['non-uuid department', { department_id: 'eng' }],
    ['bad date', { weekend_date: '17/10/2026' }],
    ['deadline without offset', { return_deadline: '2026-10-17T17:00:00' }],
    ['blank requested_room', { requested_room: '   ' }],
  ])('422 Invalid request body: %s', async (_label, overrides) => {
    const res = await submitForm(formWith(overrides));
    expect(res).toEqual(failure(422, 'Invalid request body'));
    expect(fake.uploads).toHaveLength(0);
  });

  it('422 when the date is not a weekend', async () => {
    const res = await submitForm(formWith({ weekend_date: WEDNESDAY }));
    expect(res).toEqual(
      failure(422, 'The selected date must be a Saturday or Sunday.')
    );
  });

  it('422 when no letter is attached', async () => {
    const res = await submitForm(formWith({}, null));
    expect(res).toEqual(failure(422, 'An authorisation letter is required.'));
  });

  it('422 when the letter is empty', async () => {
    const res = await submitForm(
      formWith({}, letter('a.pdf', 'application/pdf', 0))
    );
    expect(res).toEqual(failure(422, 'An authorisation letter is required.'));
  });

  it('413 when the letter is over 5MB', async () => {
    const res = await submitForm(
      formWith({}, letter('a.pdf', 'application/pdf', 5 * 1024 * 1024 + 1))
    );
    expect(res).toEqual(
      failure(413, 'The authorisation letter must be 5MB or smaller.')
    );
    expect(fake.uploads).toHaveLength(0);
  });

  it('422 when the letter is not an image or PDF', async () => {
    const res = await submitForm(formWith({}, letter('a.txt', 'text/plain')));
    expect(res).toEqual(
      failure(422, 'The authorisation letter must be an image or a PDF.')
    );
  });

  it('500 with a ref when the upload fails, and calls no RPC', async () => {
    fake.upload = { data: null, error: { message: 'bucket gone' } };
    const res = await submitForm(formWith());
    expectRef(res);
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it('404 Department not found for NOT_FOUND', async () => {
    fake.rpc.create_guest_weekend_request = rpcError(
      `NOT_FOUND: unit ${UNIT_ID} does not exist`
    );
    const res = await submitForm(formWith());
    expect(res).toEqual(failure(404, 'Department not found'));
    expect(notifyAfterResponse).not.toHaveBeenCalled();
  });

  it('500 with a ref, never the raw text, for an unrecognised RPC error', async () => {
    fake.rpc.create_guest_weekend_request = rpcError(
      'new row for relation "requests" violates check constraint'
    );
    const res = await submitForm(formWith());
    expectRef(res);
    expect(res.body.error).not.toContain('violates');
  });

  it('500 with a ref when the RPC returns no row', async () => {
    fake.rpc.create_guest_weekend_request = { data: [], error: null };
    expectRef(await submitForm(formWith()));
  });

  it('201 with the access token; uploads under guest/ and notifies twice', async () => {
    const res = await submitForm(formWith());
    expect(res).toEqual(
      success({ access_token: TOKEN, request_id: REQUEST_ID }, 201)
    );

    expect(fake.uploads).toHaveLength(1);
    const [upload] = fake.uploads;
    expect(upload.bucket).toBe('weekend-letters');
    expect(upload.path).toMatch(/^guest\/[0-9a-f-]{36}\.pdf$/);
    expect(upload.options).toEqual({
      contentType: 'application/pdf',
      upsert: false,
    });

    expect(fake.rpcCalls).toEqual([
      {
        name: 'create_guest_weekend_request',
        args: {
          p_full_name: 'Jane Doe',
          p_email: 'jane@example.com',
          p_phone: '08012345678',
          p_id_type: 'National ID',
          p_id_number: 'A1234567',
          p_department_id: UNIT_ID,
          p_weekend_date: SATURDAY,
          p_return_deadline: '2026-10-17T17:00:00+01:00',
          p_letter_url: `https://project.supabase.co/storage/v1/object/public/weekend-letters/${upload.path}`,
          p_requested_room: 'Senate Hall A',
        },
      },
    ]);

    expect(vi.mocked(notifyAfterResponse).mock.calls).toEqual([
      [{ type: 'GUEST_SUBMISSION_RECEIVED', requestId: REQUEST_ID }],
      [{ type: 'WEEKEND_SUBMITTED', requestId: REQUEST_ID }],
    ]);
  });

  it('sends an empty phone when none is given, and falls back to .bin', async () => {
    const res = await submitForm(
      formWith({ phone: null }, letter('scan copy', 'image/png'))
    );
    expect(res.status).toBe(201);
    expect(fake.uploads[0].path).toMatch(/^guest\/[0-9a-f-]{36}\.bin$/);
    expect(fake.rpcCalls[0].args).toMatchObject({ p_phone: '' });
  });
});

// ---------------------------------------------------------------------------
// GET /api/public/weekend-request/[token]
// ---------------------------------------------------------------------------

describe('GET /api/public/weekend-request/[token]', () => {
  const ROW = {
    id: REQUEST_ID,
    status: 'APPROVED',
    requested_for: '2026-10-17',
    return_deadline: '2026-10-17T16:00:00Z',
    code: '123456',
    code_expires_at: '2026-10-17T08:10:00Z',
    return_code: '654321',
    return_code_expires_at: '2026-10-17T12:15:00Z',
    requested_room: 'Senate Hall A',
    keys: { code: 'NS-304', room_name: 'Senate Hall A' },
    guest_requesters: { full_name: 'Jane Doe' },
  };

  const read = (token = TOKEN) =>
    call(status, get(`/api/public/weekend-request/${token}`), { token });

  it('404 for a malformed token, without a query', async () => {
    expect(await read('not-a-uuid')).toEqual(failure(404, 'Request not found'));
    expect(fake.queries).toHaveLength(0);
  });

  it('404 for an unknown token', async () => {
    fake.tables.requests = { data: null, error: null };
    expect(await read()).toEqual(failure(404, 'Request not found'));
  });

  it('500 with a ref when the lookup fails', async () => {
    fake.tables.requests = { data: null, error: { message: 'boom' } };
    expectRef(await read());
  });

  it('looks the request up by access_token only', async () => {
    fake.tables.requests = { data: ROW, error: null };
    await read();
    expect(fake.queries).toHaveLength(1);
    expect(fake.queries[0].ops).toContainEqual(['eq', ['access_token', TOKEN]]);
  });

  it('hides both codes outside CODE_ISSUED / KEY_ISSUED', async () => {
    fake.tables.requests = { data: ROW, error: null };
    expect(await read()).toEqual(
      success({
        request_id: REQUEST_ID,
        status: 'APPROVED',
        requested_for: '2026-10-17',
        return_deadline: '2026-10-17T16:00:00Z',
        requested_room: 'Senate Hall A',
        full_name: 'Jane Doe',
        key: { code: 'NS-304', room_name: 'Senate Hall A' },
        code: null,
        code_expires_at: null,
        return_code: null,
        return_code_expires_at: null,
      })
    );
  });

  it('shows the collection code only while CODE_ISSUED', async () => {
    fake.tables.requests = {
      data: { ...ROW, status: 'CODE_ISSUED' },
      error: null,
    };
    const res = await read();
    expect(res.body.data).toMatchObject({
      code: '123456',
      code_expires_at: '2026-10-17T08:10:00Z',
      return_code: null,
      return_code_expires_at: null,
    });
  });

  it('shows the return code only while KEY_ISSUED', async () => {
    fake.tables.requests = {
      data: { ...ROW, status: 'KEY_ISSUED' },
      error: null,
    };
    const res = await read();
    expect(res.body.data).toMatchObject({
      code: null,
      code_expires_at: null,
      return_code: '654321',
      return_code_expires_at: '2026-10-17T12:15:00Z',
    });
  });

  it('null key, room and name when absent', async () => {
    fake.tables.requests = {
      data: {
        ...ROW,
        keys: null,
        guest_requesters: null,
        requested_room: null,
      },
      error: null,
    };
    const res = await read();
    expect(res.body.data).toMatchObject({
      key: null,
      full_name: null,
      requested_room: null,
    });
  });
});

// ---------------------------------------------------------------------------
// Token-keyed actions: code, return-code, expire
// ---------------------------------------------------------------------------

type TokenRoute = {
  name: string;
  handler: unknown;
  suffix: string;
  rpc: string;
  /** The 404 message for a malformed token. */
  notFound: string;
  errors: Array<[raised: string, status: number, message: string]>;
  okRow: Record<string, unknown>;
  okData: Record<string, unknown>;
  notifies: boolean;
};

const TOKEN_ROUTES: TokenRoute[] = [
  {
    name: 'code',
    handler: code,
    suffix: 'code',
    rpc: 'generate_guest_weekend_code',
    notFound: 'Request not found',
    errors: [
      ['NOT_FOUND: request does not exist', 404, 'Request not found'],
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
        'This request is not approved for collection.',
      ],
    ],
    okRow: {
      request_id: REQUEST_ID,
      code: '123456',
      code_expires_at: '2026-10-17T08:10:00Z',
    },
    okData: {
      request_id: REQUEST_ID,
      code: '123456',
      code_expires_at: '2026-10-17T08:10:00Z',
    },
    notifies: true,
  },
  {
    name: 'return-code',
    handler: returnCode,
    suffix: 'return-code',
    rpc: 'request_return_guest',
    notFound: 'Request not found.',
    errors: [
      ['NOT_FOUND: request does not exist', 404, 'Request not found.'],
      [
        'CONFLICT: request is not in KEY_ISSUED state (current: KEY_RETURNED)',
        409,
        'Key is not currently issued.',
      ],
    ],
    okRow: {
      request_id: REQUEST_ID,
      return_code: '654321',
      return_code_expires_at: '2026-10-17T12:15:00Z',
    },
    okData: {
      return_code: '654321',
      return_code_expires_at: '2026-10-17T12:15:00Z',
    },
    notifies: false,
  },
  {
    name: 'expire',
    handler: expire,
    suffix: 'expire',
    rpc: 'expire_guest_request',
    notFound: 'Request not found',
    errors: [
      ['NOT_FOUND: request does not exist', 404, 'Request not found'],
      [
        'NOT_EXPIRED: the code has not expired yet',
        409,
        'The code has not expired yet.',
      ],
    ],
    okRow: { request_id: REQUEST_ID, status: 'EXPIRED' },
    okData: { request_id: REQUEST_ID, status: 'EXPIRED' },
    notifies: false,
  },
];

describe.each(TOKEN_ROUTES)('POST /api/public/weekend-request/[token]/$name', (r) => {
  const hit = (token = TOKEN) =>
    call(r.handler, post(`/api/public/weekend-request/${token}/${r.suffix}`), {
      token,
    });

  it('404 for a malformed token, without calling the RPC', async () => {
    expect(await hit('nope')).toEqual(failure(404, r.notFound));
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it.each(r.errors)('maps %s', async (raised, statusCode, message) => {
    fake.rpc[r.rpc] = rpcError(raised);
    expect(await hit()).toEqual(failure(statusCode, message));
    expect(notifyAfterResponse).not.toHaveBeenCalled();
  });

  it('500 with a ref, never the raw text, for an unrecognised error', async () => {
    fake.rpc[r.rpc] = rpcError('connection reset by peer');
    const res = await hit();
    expectRef(res);
    expect(res.body.error).not.toContain('connection');
  });

  it('500 with a ref when the RPC returns no row', async () => {
    fake.rpc[r.rpc] = { data: [], error: null };
    expectRef(await hit());
  });

  it('200 with the success shape, passing only the token', async () => {
    fake.rpc[r.rpc] = { data: [r.okRow], error: null };
    expect(await hit()).toEqual(success(r.okData));
    expect(fake.rpcCalls).toEqual([
      { name: r.rpc, args: { p_access_token: TOKEN } },
    ]);
    if (r.notifies) {
      expect(notifyAfterResponse).toHaveBeenCalledWith({
        type: 'CODE_ISSUED',
        requestId: REQUEST_ID,
      });
    } else {
      expect(notifyAfterResponse).not.toHaveBeenCalled();
    }
  });
});

// ---------------------------------------------------------------------------
// Uncaught throws (e.g. a misconfigured service-role client)
// ---------------------------------------------------------------------------

// Behaviour change (route() migration): these used to reject, which Next
// turned into a bare, unenveloped 500. route() now catches the throw and
// answers an enveloped 500 with a ref, never the thrown text.
describe('uncaught throws', () => {
  beforeEach(() => {
    fake.adminThrows = new Error('supabaseKey is required');
  });

  const validSubmitForm = () => {
    const form = new FormData();
    form.set('full_name', 'Jane Doe');
    form.set('email', 'jane@example.com');
    form.set('id_document_type', 'National ID');
    form.set('id_document_number', 'A1234567');
    form.set('requested_room', 'Senate Hall A');
    form.set('department_id', UNIT_ID);
    form.set('weekend_date', '2026-10-17');
    form.set('return_deadline', '2026-10-17T17:00:00+01:00');
    form.set(
      'letter',
      new File([new Uint8Array(16)], 'l.pdf', { type: 'application/pdf' })
    );
    return form;
  };

  it.each([
    ['status', status, () => get(`/api/public/weekend-request/${TOKEN}`)],
    ['code', code, () => post(`/api/public/weekend-request/${TOKEN}/code`)],
    [
      'return-code',
      returnCode,
      () => post(`/api/public/weekend-request/${TOKEN}/return-code`),
    ],
    [
      'expire',
      expire,
      () => post(`/api/public/weekend-request/${TOKEN}/expire`),
    ],
    [
      'submit',
      submit,
      () => postForm('/api/public/weekend-request', validSubmitForm()),
    ],
  ])('%s answers an enveloped 500 with a ref', async (_n, handler, req) => {
    const res = await call(handler, req(), { token: TOKEN });
    expectRef(res);
    expect(res.body.error).not.toContain('supabaseKey');
  });
});
