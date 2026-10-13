// @vitest-environment node
// Contract for the collector-slot routes (admin/authorisations) and the CSO's
// held signature-reference resolution (admin/signature-references/resolve):
// status and message for every auth outcome, bad body or params and RPC
// error kind each route maps — including nominate_collector's two CONFLICTs,
// told apart by detail — plus success shapes. Written against the routes
// before they moved onto route(); kept as the regression net after.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE as removeCollector } from '@/app/api/admin/authorisations/[key_id]/[requester_id]/route';
import { POST as nominate } from '@/app/api/admin/authorisations/route';
import { POST as resolveReference } from '@/app/api/admin/signature-references/resolve/route';
import { logger } from '@/lib/logger';

import {
  KEY_ID,
  asRole,
  call,
  describeAuth,
  expectRef,
  failure,
  fake,
  post,
  resetFake,
  rpcError,
  send,
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

const REQUESTER_ID = '88888888-8888-4888-8888-888888888888';
const DEAN_ID = '99999999-9999-4999-8999-999999999999';

// The old nominate route minted 8-character refs.
const SHORT_REF = /^Internal error\. Ref: [0-9a-f]{8}$/;

beforeEach(() => {
  resetFake();
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
});

// ---------------------------------------------------------------------------
// POST /api/admin/authorisations
// ---------------------------------------------------------------------------

describe('POST /api/admin/authorisations', () => {
  const path = '/api/admin/authorisations';
  const body = { key_id: KEY_ID, requester_id: REQUESTER_ID };

  beforeEach(() => {
    asRole('DEAN');
    fake.rpc.nominate_collector = { data: [{ slot_number: 2 }], error: null };
  });

  describe('auth', () => {
    it('401 Unauthorized with no session', async () => {
      fake.user = null;
      expect(await call(nominate, post(path, body))).toEqual(
        failure(401, 'Unauthorized')
      );
    });

    // BUG: no route-level role check — any signed-in user, even one with no
    // profile row, reaches the RPC, which is the only gate.
    it.each([
      ['no profile', null],
      ['a VERIFIER', 'VERIFIER'],
      ['a REQUESTER', 'REQUESTER'],
    ] as const)('lets %s reach the RPC', async (_label, role) => {
      if (role) asRole(role);
      else fake.profile = null;
      expect((await call(nominate, post(path, body))).status).toBe(201);
      expect(fake.rpcCalls).toHaveLength(1);
    });

    it.each(['CSO', 'DEAN'] as const)('allows %s', async (role) => {
      asRole(role);
      expect((await call(nominate, post(path, body))).status).toBe(201);
    });
  });

  it.each([
    ['not JSON', 'not json'],
    ['a non-uuid key', { ...body, key_id: 'nope' }],
    ['no requester', { key_id: KEY_ID }],
  ])('422 for %s', async (_label, bad) => {
    expect(await call(nominate, post(path, bad))).toEqual(
      failure(422, 'Invalid request body')
    );
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it.each([
    ['NOT_AUTHENTICATED', 401, 'Unauthorized'],
    ['NOT_FOUND: key does not exist', 404, 'Key not found'],
    [
      'FORBIDDEN: key does not belong to your department',
      403,
      'Key not in your department',
    ],
    // BUG: misleading — this is a Dean (or anyone but the CSO) acting on an
    // Administration key, not a key from another department.
    [
      'FORBIDDEN: only the CSO can authorise collectors for administrative keys',
      403,
      'Key not in your department',
    ],
    [
      'REQUESTER_INACTIVE: user is not an active requester',
      422,
      'This user account is deactivated and cannot be authorised',
    ],
    [
      'CONFLICT: three authorisation slots are already filled',
      409,
      'Three authorisation slots are already filled',
    ],
    [
      'CONFLICT: requester is already authorised for this key',
      409,
      'Requester is already authorised for this key',
    ],
  ])('maps %s → %i', async (raised, status, message) => {
    fake.rpc.nominate_collector = rpcError(raised);
    expect(await call(nominate, post(path, body))).toEqual(
      failure(status, message)
    );
  });

  it('500 with a ref for an unrecognised RPC failure', async () => {
    fake.rpc.nominate_collector = rpcError('connection reset');
    const res = await call(nominate, post(path, body));
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(SHORT_REF);
  });

  it('500 with a ref for a CONFLICT it does not recognise', async () => {
    fake.rpc.nominate_collector = rpcError('CONFLICT: something else');
    const res = await call(nominate, post(path, body));
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(SHORT_REF);
  });

  // BUG: a null RPC result is reported as a created slot with no number.
  it('201 with a null slot when the RPC returns no row', async () => {
    fake.rpc.nominate_collector = { data: null, error: null };
    const res = await call(nominate, post(path, body));
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      authorisation_id: `${KEY_ID}:${REQUESTER_ID}`,
      slot_number: null,
    });
  });

  it('201 with the composite id and slot number', async () => {
    // BUG: the envelope status says 200 while the HTTP status is 201.
    expect(await call(nominate, post(path, body))).toEqual({
      status: 201,
      body: {
        data: {
          authorisation_id: `${KEY_ID}:${REQUESTER_ID}`,
          slot_number: 2,
        },
        error: null,
        status: 200,
      },
    });
    expect(fake.rpcCalls).toEqual([
      {
        name: 'nominate_collector',
        args: { p_key_id: KEY_ID, p_requester_id: REQUESTER_ID },
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/authorisations/[key_id]/[requester_id]
// ---------------------------------------------------------------------------

describe('DELETE /api/admin/authorisations/[key_id]/[requester_id]', () => {
  const path = `/api/admin/authorisations/${KEY_ID}/${REQUESTER_ID}`;
  const params = { key_id: KEY_ID, requester_id: REQUESTER_ID };
  const del = () => send('DELETE', path);

  beforeEach(() => asRole('DEAN'));

  it('401 Unauthorized with no session', async () => {
    fake.user = null;
    expect(await call(removeCollector, del(), params)).toEqual(
      failure(401, 'Unauthorized')
    );
  });

  // BUG: no route-level role check, as for nominate.
  it('lets a signed-in user with no profile reach the RPC', async () => {
    fake.profile = null;
    expect((await call(removeCollector, del(), params)).status).toBe(204);
  });

  // BUG: a malformed id reaches the RPC, whose uuid cast fails as a 500.
  it('500 with a ref for a non-uuid key id (from the RPC)', async () => {
    fake.rpc.remove_collector = rpcError(
      'invalid input syntax for type uuid: "nope"'
    );
    expectRef(
      await call(removeCollector, del(), { ...params, key_id: 'nope' })
    );
    expect(fake.rpcCalls).toHaveLength(1);
  });

  it.each([
    ['NOT_AUTHENTICATED', 401, 'Unauthorized'],
    [
      'FORBIDDEN: key does not belong to your department',
      403,
      'Key not in your department',
    ],
    // BUG: misleading copy, as for nominate.
    [
      'FORBIDDEN: only the CSO can remove collectors for administrative keys',
      403,
      'Key not in your department',
    ],
    ['NOT_FOUND: key does not exist', 404, 'Authorisation not found'],
    ['NOT_FOUND: authorisation does not exist', 404, 'Authorisation not found'],
  ])('maps %s → %i', async (raised, status, message) => {
    fake.rpc.remove_collector = rpcError(raised);
    expect(await call(removeCollector, del(), params)).toEqual(
      failure(status, message)
    );
  });

  it('500 with a ref for an unrecognised RPC failure', async () => {
    fake.rpc.remove_collector = rpcError('connection reset');
    expectRef(await call(removeCollector, del(), params));
  });

  it('204 with no body; a void RPC result is success', async () => {
    expect(await call(removeCollector, del(), params)).toEqual({
      status: 204,
      body: null,
    });
    expect(fake.rpcCalls).toEqual([
      {
        name: 'remove_collector',
        args: { p_key_id: KEY_ID, p_requester_id: REQUESTER_ID },
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/signature-references/resolve
// ---------------------------------------------------------------------------

describe('POST /api/admin/signature-references/resolve', () => {
  const path = '/api/admin/signature-references/resolve';
  const body = { profile_id: DEAN_ID, type: 'signature', decision: 'APPROVED' };

  describeAuth(
    'signature-references/resolve',
    resolveReference,
    () => post(path, body),
    ['CSO']
  );

  beforeEach(() => {
    asRole('CSO');
    fake.rpc.resolve_pending_signature_reference = {
      data: [{ status: 'APPROVED', new_url: 'https://x/new.png' }],
      error: null,
    };
  });

  it.each([
    ['not JSON', 'not json'],
    ['a non-uuid profile', { ...body, profile_id: 'x' }],
    ['an unknown type', { ...body, type: 'seal' }],
    ['an unknown decision', { ...body, decision: 'MAYBE' }],
  ])('422 for %s', async (_label, bad) => {
    expect(await call(resolveReference, post(path, bad))).toEqual(
      failure(422, 'Invalid request body')
    );
  });

  it.each([
    ['NOT_AUTHENTICATED', 401, 'Unauthorized'],
    [
      'FORBIDDEN: only the CSO can resolve a held signature reference',
      403,
      'Only the CSO can resolve a held signature reference',
    ],
    [
      'NOT_FOUND: no pending reference for this profile/type',
      404,
      'No pending reference for this profile',
    ],
    [
      'INVALID_DECISION: decision must be APPROVED or DECLINED',
      422,
      'Invalid decision',
    ],
  ])('maps %s → %i', async (raised, status, message) => {
    fake.rpc.resolve_pending_signature_reference = rpcError(raised);
    expect(await call(resolveReference, post(path, body))).toEqual(
      failure(status, message)
    );
  });

  it('500 with a ref for an unrecognised RPC failure', async () => {
    fake.rpc.resolve_pending_signature_reference = rpcError('boom');
    expectRef(await call(resolveReference, post(path, body)));
  });

  // BUG: an empty RPC result throws past the handler (Next's bare 500).
  it('throws when the RPC returns no row', async () => {
    fake.rpc.resolve_pending_signature_reference = { data: [], error: null };
    await expect(call(resolveReference, post(path, body))).rejects.toThrow();
  });

  it('returns the decision and new URL, note passed through', async () => {
    expect(
      await call(resolveReference, post(path, { ...body, note: 'ok' }))
    ).toEqual(success({ status: 'APPROVED', new_url: 'https://x/new.png' }));
    expect(fake.rpcCalls).toEqual([
      {
        name: 'resolve_pending_signature_reference',
        args: {
          p_profile_id: DEAN_ID,
          p_type: 'signature',
          p_decision: 'APPROVED',
          p_note: 'ok',
        },
      },
    ]);
  });

  it('a decline returns a null URL', async () => {
    fake.rpc.resolve_pending_signature_reference = {
      data: [{ status: 'DECLINED', new_url: null }],
      error: null,
    };
    expect(
      await call(
        resolveReference,
        post(path, { ...body, decision: 'DECLINED' })
      )
    ).toEqual(success({ status: 'DECLINED', new_url: null }));
    expect(fake.rpcCalls[0].args).toMatchObject({ p_note: undefined });
  });
});
