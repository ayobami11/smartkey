// @vitest-environment node
// Contract for POST /api/requests/collect: every status and message the
// verifier desk can see. Written against the hand-rolled route before it moved
// onto route(); kept as the regression net afterwards.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/requests/collect/route';
import { logger } from '@/lib/logger';

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

const PATH = '/api/requests/collect';
const BODY = { code: '123456' };
const FUTURE = new Date(Date.now() + 5 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 60 * 1000).toISOString();

const REQUEST_ROW = {
  id: REQUEST_ID,
  status: 'CODE_ISSUED',
  code_expires_at: FUTURE,
  key_id: KEY_ID,
  requester_id: '44444444-4444-4444-8444-444444444444',
  guest_id: null as string | null,
};

const collect = (body: unknown = BODY) => call(POST, post(PATH, body));

beforeEach(() => {
  resetFake();
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  fake.profile = { role: 'VERIFIER', unit_id: null, full_name: 'Officer Musa' };
  fake.tables.requests = { data: REQUEST_ROW, error: null };
  fake.tables.keys = {
    data: { code: 'NS-304', room_name: 'Senate Hall A', key_count: 3 },
    error: null,
  };
  fake.tables.profiles = {
    data: {
      full_name: 'Dr. Bakare',
      photo_url:
        'https://x.supabase.co/storage/v1/object/public/passport-photos/u1/photo.png',
    },
    error: null,
  };
  fake.rpc.issue_key = {
    data: [{ request_id: REQUEST_ID, issued_at: '2026-10-13T09:00:00Z' }],
    error: null,
  };
});

describe('collect — auth and body', () => {
  it('401s with no session', async () => {
    fake.user = null;
    expect(await collect()).toEqual(failure(401, 'Unauthorized'));
  });

  it('401s when the user has no profile', async () => {
    fake.profile = null;
    expect(await collect()).toEqual(failure(401, 'Unauthorized'));
  });

  it('403s a non-verifier', async () => {
    fake.profile = { role: 'REQUESTER', unit_id: null, full_name: 'x' };
    expect(await collect()).toEqual(failure(403, 'Forbidden'));
  });

  it.each([['{not json'], [{ code: '12345' }], [{ code: 'abcdef' }], [{}]])(
    '422s a bad body (%j)',
    async (body) => {
      expect(await collect(body)).toEqual(failure(422, 'Invalid request body'));
    }
  );
});

describe('collect — code lookup', () => {
  it('404s an unknown or used code', async () => {
    fake.tables.requests = { data: null, error: null };
    expect(await collect()).toEqual(
      failure(404, 'Code not found or already used')
    );
    expect(fake.rpcCalls).toEqual([]);
  });

  it('404s an expired code without calling the RPC', async () => {
    fake.tables.requests = {
      data: { ...REQUEST_ROW, code_expires_at: PAST },
      error: null,
    };
    expect(await collect()).toEqual(failure(404, 'Code has expired'));
    expect(fake.rpcCalls).toEqual([]);
  });

  it('looks the code up among CODE_ISSUED requests only', async () => {
    await collect();
    const lookup = fake.queries.find((q) => q.table === 'requests');
    expect(lookup?.ops).toContainEqual(['eq', ['code', '123456']]);
    expect(lookup?.ops).toContainEqual(['eq', ['status', 'CODE_ISSUED']]);
  });
});

describe('collect — issue_key errors', () => {
  it.each([
    ['NOT_AUTHENTICATED: no session', 401, 'Not authenticated'],
    ['FORBIDDEN: only a verifier can issue keys', 403, 'Forbidden'],
    [`NOT_FOUND: request ${REQUEST_ID} does not exist`, 404, 'Not found'],
    [
      'NOT_AUTHORISED: requester is not whitelisted',
      403,
      'Not authorised for this key',
    ],
    ['EXPIRED_CODE: the 6-digit code has expired', 404, 'Code has expired'],
    // The two capacity-guard messages are verifier-facing copy, passed through.
    [
      'CONFLICT: this key is already issued and has not been returned',
      409,
      'this key is already issued and has not been returned',
    ],
    [
      'CONFLICT: all 3 keys on this bunch are out and none has been returned',
      409,
      'all 3 keys on this bunch are out and none has been returned',
    ],
  ])('%s → %i', async (message, status, error) => {
    fake.rpc.issue_key = rpcError(message);
    expect(await collect()).toEqual(failure(status, error));
  });

  // Current behaviour, pinned before the migration: split(': ') truncates the
  // detail mid-clause, and NO_KEYS_AVAILABLE is not mapped at all.
  it('truncates a state CONFLICT at its second colon', async () => {
    fake.rpc.issue_key = rpcError(
      'CONFLICT: request is not in CODE_ISSUED state (current: KEY_ISSUED)'
    );
    expect(await collect()).toEqual(
      failure(409, 'request is not in CODE_ISSUED state (current')
    );
  });

  it('500s NO_KEYS_AVAILABLE', async () => {
    fake.rpc.issue_key = rpcError(
      'NO_KEYS_AVAILABLE: every key on this bunch is currently out or reserved (3 of 3)'
    );
    const res = await collect();
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(REF_PATTERN);
  });

  it('500s an unrecognised failure with a ref', async () => {
    fake.rpc.issue_key = rpcError('connection reset');
    const res = await collect();
    expect(res.status).toBe(500);
    expect(res.body.status).toBe(500);
    expect(res.body.error).toMatch(REF_PATTERN);
  });

  it('500s an empty RPC result with a ref', async () => {
    fake.rpc.issue_key = { data: [], error: null };
    const res = await collect();
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(REF_PATTERN);
  });

  it('issues as the session user, never a client-supplied id', async () => {
    await collect({ ...BODY, verifier_id: 'someone-else' });
    expect(fake.rpcCalls).toEqual([
      {
        name: 'issue_key',
        args: { p_request_id: REQUEST_ID, p_verifier_id: USER_ID },
      },
    ]);
  });
});

describe('collect — success', () => {
  it('returns the registered requester with a proxied photo', async () => {
    expect(await collect()).toEqual(
      success({
        request_id: REQUEST_ID,
        is_guest: false,
        requester: {
          full_name: 'Dr. Bakare',
          photo_url: expect.stringMatching(
            /^\/api\/storage\/object\?bucket=passport-photos&path=u1%2Fphoto\.png/
          ),
        },
        key: { code: 'NS-304', room_name: 'Senate Hall A', key_count: 3 },
        issued_at: '2026-10-13T09:00:00Z',
      })
    );
  });

  it('returns a guest with their declared ID document', async () => {
    fake.tables.requests = {
      data: { ...REQUEST_ROW, requester_id: null, guest_id: 'g1' },
      error: null,
    };
    fake.tables.guest_requesters = {
      data: {
        full_name: 'Jane Doe',
        id_document_type: 'National ID',
        id_document_number: 'A1234567',
      },
      error: null,
    };
    expect(await collect()).toEqual(
      success({
        request_id: REQUEST_ID,
        is_guest: true,
        requester: {
          full_name: 'Jane Doe',
          photo_url: null,
          id_document_type: 'National ID',
          id_document_number: 'A1234567',
        },
        key: { code: 'NS-304', room_name: 'Senate Hall A', key_count: 3 },
        issued_at: '2026-10-13T09:00:00Z',
      })
    );
  });
});
