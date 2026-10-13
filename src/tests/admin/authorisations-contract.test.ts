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

  // CHANGED by the route() migration: there was no route-level role check,
  // so any signed-in user (even one with no profile row) reached the RPC,
  // which answered 403 "Key not in your department". Now a session with no
  // profile is 401 and a VERIFIER or REQUESTER is 403 Forbidden before the
  // RPC runs. The RPC still decides which keys a CSO or Dean may touch.
  describeAuth('admin/authorisations', nominate, () => post(path, body), [
    'CSO',
    'DEAN',
  ]);

  it.each(['CSO', 'DEAN'] as const)('lets %s reach the RPC', async (role) => {
    asRole(role);
    expect((await call(nominate, post(path, body))).status).toBe(201);
    expect(fake.rpcCalls).toHaveLength(1);
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
    // CHANGED by the route() migration: this used to say "Key not in your
    // department", which is the wrong reason for a Dean acting on an
    // Administration key.
    [
      'FORBIDDEN: only the CSO can authorise collectors for administrative keys',
      403,
      'Only the CSO can manage collectors for Administration keys',
    ],
    // An unknown FORBIDDEN detail keeps the department copy.
    ['FORBIDDEN: something new', 403, 'Key not in your department'],
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

  // CHANGED by the route() migration: the ref was 8 characters; it is now
  // the full ref callRpc logs.
  it('500 with a ref for an unrecognised RPC failure', async () => {
    fake.rpc.nominate_collector = rpcError('connection reset');
    expectRef(await call(nominate, post(path, body)));
  });

  // CHANGED by the route() migration: an unrecognised CONFLICT detail was a
  // ref'd 500; it now gets the catalogue's 409. nominate_collector raises no
  // such detail today.
  it('409 with the catalogue copy for a CONFLICT it does not recognise', async () => {
    fake.rpc.nominate_collector = rpcError('CONFLICT: something else');
    expect(await call(nominate, post(path, body))).toEqual(
      failure(409, "This action conflicts with the request's current state.")
    );
  });

  // CHANGED by the route() migration: a null RPC result was reported as a
  // created slot with a null number; it is now a ref'd 500.
  it('500 with a ref when the RPC returns no row', async () => {
    fake.rpc.nominate_collector = { data: null, error: null };
    expectRef(await call(nominate, post(path, body)));
  });

  it('201 with the composite id and slot number', async () => {
    // CHANGED by the route() migration: the envelope status said 200 while
    // the HTTP status was 201.
    expect(await call(nominate, post(path, body))).toEqual(
      success(
        { authorisation_id: `${KEY_ID}:${REQUESTER_ID}`, slot_number: 2 },
        201
      )
    );
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

  // CHANGED by the route() migration: no route-level role check before, as
  // for nominate; no profile is now 401 and other roles 403.
  describeAuth(
    'admin/authorisations/[key_id]/[requester_id]',
    removeCollector,
    del,
    ['CSO', 'DEAN'],
    params
  );

  // CHANGED by the route() migration: a malformed id reached the RPC, whose
  // uuid cast failed as a ref'd 500; it is now a 404 without calling it.
  it.each([
    ['key id', { ...params, key_id: 'nope' }],
    ['requester id', { ...params, requester_id: 'nope' }],
  ])('404 Authorisation not found for a non-uuid %s', async (_label, bad) => {
    expect(await call(removeCollector, del(), bad)).toEqual(
      failure(404, 'Authorisation not found')
    );
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it.each([
    ['NOT_AUTHENTICATED', 401, 'Unauthorized'],
    [
      'FORBIDDEN: key does not belong to your department',
      403,
      'Key not in your department',
    ],
    // CHANGED by the route() migration: misleading copy, as for nominate.
    [
      'FORBIDDEN: only the CSO can remove collectors for administrative keys',
      403,
      'Only the CSO can manage collectors for Administration keys',
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

  // CHANGED by the route() migration: an empty RPC result threw past the
  // handler (Next's bare 500); it is now an enveloped 500 with a ref.
  it('500 with a ref when the RPC returns no row', async () => {
    fake.rpc.resolve_pending_signature_reference = { data: [], error: null };
    expectRef(await call(resolveReference, post(path, body)));
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
