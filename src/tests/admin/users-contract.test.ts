// @vitest-environment node
// Contract for the admin/users* routes: the status and message for every
// auth outcome, bad body or params, query failure and RPC error kind each
// route maps, plus its success shape. Written against the routes before they
// moved onto route(); kept as the regression net after. admin/users/[id] and
// admin/users/[id]/revoke were already on route() (PR #64) and are pinned
// here so the batch cannot drift them.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PATCH as revoke } from '@/app/api/admin/users/[id]/revoke/route';
import { POST as resendInvite } from '@/app/api/admin/users/[id]/resend-invite/route';
import { PATCH as editUser } from '@/app/api/admin/users/[id]/route';
import {
  GET as listUsers,
  POST as provision,
} from '@/app/api/admin/users/route';
import { logger } from '@/lib/logger';

import {
  asRole,
  AUTH_USER_ID,
  call,
  describeAuth,
  expectRef,
  failure,
  fake,
  get,
  post,
  resetFake,
  rpcError,
  send,
  success,
  type Op,
} from '../http/contract-harness';

const mail = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('@/lib/supabase/server', async () => {
  const h = await import('../http/contract-harness');
  return { createServerClient: async () => h.makeClient('server') };
});
vi.mock('@/lib/supabase/admin', async () => {
  const h = await import('../http/contract-harness');
  return { createAdminClient: () => h.makeClient('admin') };
});
vi.mock('@/lib/email/transport', () => ({ gmailTransport: mail }));

const TARGET_ID = '66666666-6666-4666-8666-666666666666';
const UNIT_ID = '77777777-7777-4777-8777-777777777777';

const hasOp = (ops: Op[], method: string) => ops.some(([m]) => m === method);

beforeEach(() => {
  resetFake();
  mail.send.mockReset();
  mail.send.mockResolvedValue(undefined);
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
});

// ---------------------------------------------------------------------------
// POST /api/admin/users
// ---------------------------------------------------------------------------

describe('POST /api/admin/users', () => {
  const path = '/api/admin/users';
  const body = {
    full_name: 'Ada Obi',
    institutional_email: 'ada@unilag.edu.ng',
    role: 'VERIFIER',
  };

  describeAuth('admin/users POST', provision, () => post(path, body), ['CSO']);

  beforeEach(() => {
    asRole('CSO');
    fake.rpc.provision_user = {
      data: [{ profile_id: TARGET_ID, activation_token: 'secret' }],
      error: null,
    };
  });

  it.each([
    ['not JSON', 'not json'],
    ['a bad email', { ...body, institutional_email: 'nope' }],
    ['the CSO role', { ...body, role: 'CSO' }],
    ['an empty name', { ...body, full_name: '' }],
    // CHANGED: a blank or over-long name used to be accepted (no trim, no max).
    ['a blank name', { ...body, full_name: '   ' }],
    ['a 121-character name', { ...body, full_name: 'a'.repeat(121) }],
    ['a non-uuid unit', { ...body, unit_id: 'unit-1' }],
  ])('422 for %s', async (_label, bad) => {
    expect(await call(provision, post(path, bad))).toEqual(
      failure(422, 'Invalid request body')
    );
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it.each(['DEAN', 'REQUESTER'])(
    '422 when a %s has no unit_id',
    async (role) => {
      expect(await call(provision, post(path, { ...body, role }))).toEqual(
        failure(422, 'unit_id is required for Dean and Requester roles')
      );
      expect(fake.authAdminCalls).toHaveLength(0);
    }
  );

  it('409 when the Dean unit already has an ACTIVE Dean', async () => {
    fake.tables.units = {
      data: { hod_id: 'someone', hod: { status: 'ACTIVE' } },
      error: null,
    };
    expect(
      await call(
        provision,
        post(path, { ...body, role: 'DEAN', unit_id: UNIT_ID })
      )
      // CHANGED: the copy said "This department already has an active HOD".
    ).toEqual(failure(409, 'That unit already has an active Dean.'));
    expect(fake.authAdminCalls).toHaveLength(0);
  });

  it('provisions a Dean whose unit has only a non-active Dean', async () => {
    fake.tables.units = {
      data: { hod_id: 'someone', hod: { status: 'PENDING_ACTIVATION' } },
      error: null,
    };
    const res = await call(
      provision,
      post(path, { ...body, role: 'DEAN', unit_id: UNIT_ID })
    );
    expect(res.status).toBe(201);
    expect(fake.rpcCalls).toEqual([
      {
        name: 'provision_user',
        args: {
          p_full_name: 'Ada Obi',
          p_email: 'ada@unilag.edu.ng',
          p_role: 'DEAN',
          p_department_id: UNIT_ID,
        },
      },
    ]);
  });

  describe('an existing profile for the email', () => {
    const existing = (status: string) => {
      fake.tables.profiles = { data: { id: TARGET_ID, status }, error: null };
    };

    beforeEach(() => {
      fake.rpc.record_invite_resent = {
        data: [
          {
            profile_id: TARGET_ID,
            status: 'PENDING_ACTIVATION',
            role: 'VERIFIER',
            institutional_email: 'ada@unilag.edu.ng',
          },
        ],
        error: null,
      };
      fake.rpc.reinstate_user = {
        data: [
          {
            profile_id: TARGET_ID,
            status: 'PENDING_ACTIVATION',
            role: 'VERIFIER',
          },
        ],
        error: null,
      };
      fake.rpc.deactivate_user = {
        data: [{ profile_id: TARGET_ID, status: 'DEACTIVATED' }],
        error: null,
      };
    });

    it('409 Email already registered when ACTIVE', async () => {
      existing('ACTIVE');
      expect(await call(provision, post(path, body))).toEqual(
        failure(409, 'Email already registered')
      );
      expect(fake.rpcCalls).toHaveLength(0);
      expect(fake.authAdminCalls).toHaveLength(0);
    });

    // CHANGED: the re-invite used to reset the profile through the
    // service-role client with no audit entry and no RPC.
    it('re-invites a PENDING_ACTIVATION user through record_invite_resent', async () => {
      existing('PENDING_ACTIVATION');
      expect(await call(provision, post(path, body))).toEqual(
        success({ profile_id: TARGET_ID, status: 'PENDING_ACTIVATION' })
      );
      expect(fake.rpcCalls).toEqual([
        {
          name: 'record_invite_resent',
          args: {
            p_profile_id: TARGET_ID,
            p_full_name: 'Ada Obi',
            p_unit_id: undefined,
          },
        },
      ]);
      expect(fake.authAdminCalls.map((c) => c.method)).toEqual([
        'generateLink',
      ]);
      expect(fake.authAdminCalls[0].args[0]).toEqual({
        type: 'magiclink',
        email: 'ada@unilag.edu.ng',
      });
      // No direct profile write from either client any more.
      expect(fake.queries.some((q) => hasOp(q.ops, 'update'))).toBe(false);
      expect(mail.send).toHaveBeenCalledTimes(1);
    });

    // CHANGED: the activation link followed the role in the form; a
    // re-invite never changes the stored role, so it now follows that.
    it('points the re-invite at the stored role, not the form role', async () => {
      existing('PENDING_ACTIVATION');
      fake.rpc.record_invite_resent = {
        data: [
          {
            profile_id: TARGET_ID,
            status: 'PENDING_ACTIVATION',
            role: 'DEAN',
            institutional_email: 'ada@unilag.edu.ng',
          },
        ],
        error: null,
      };
      expect((await call(provision, post(path, body))).status).toBe(200);
      expect(JSON.stringify(mail.send.mock.calls[0][0])).toContain(
        encodeURIComponent('/dean/onboarding')
      );
    });

    // CHANGED: the ban was lifted first, before any profile change, and
    // nothing was audited. Now: link, reinstate_user (USER_REINSTATED), then
    // the ban is lifted.
    it('reinstates a DEACTIVATED user, then lifts the ban', async () => {
      existing('DEACTIVATED');
      expect(await call(provision, post(path, body))).toEqual(
        success({ profile_id: TARGET_ID, status: 'PENDING_ACTIVATION' })
      );
      expect(fake.rpcCalls).toEqual([
        {
          name: 'reinstate_user',
          args: {
            p_profile_id: TARGET_ID,
            p_full_name: 'Ada Obi',
            p_unit_id: undefined,
          },
        },
      ]);
      expect(fake.authAdminCalls).toEqual([
        {
          method: 'generateLink',
          args: [{ type: 'magiclink', email: 'ada@unilag.edu.ng' }],
        },
        {
          method: 'updateUserById',
          args: [TARGET_ID, { ban_duration: 'none' }],
        },
      ]);
      expect(mail.send).toHaveBeenCalledTimes(1);
    });

    it('500 with a ref, deactivated again and no email, when the ban cannot be lifted', async () => {
      existing('DEACTIVATED');
      fake.authAdmin.updateUserById = { data: null, error: { message: 'x' } };
      expectRef(await call(provision, post(path, body)));
      expect(fake.rpcCalls.map((c) => c.name)).toEqual([
        'reinstate_user',
        'deactivate_user',
      ]);
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('does not lift the ban when reinstate_user refuses', async () => {
      existing('DEACTIVATED');
      fake.rpc.reinstate_user = rpcError(
        'CONFLICT: that unit already has an active Dean'
      );
      expect(await call(provision, post(path, body))).toEqual(
        failure(409, 'That unit already has an active Dean.')
      );
      expect(fake.authAdminCalls.map((c) => c.method)).toEqual([
        'generateLink',
      ]);
      expect(mail.send).not.toHaveBeenCalled();
    });

    it.each([
      [
        'CONFLICT: that unit already has an active Dean',
        409,
        'That unit already has an active Dean.',
      ],
      ['CONFLICT: user is already active', 409, 'Email already registered'],
      [
        'CONFLICT: user is deactivated',
        409,
        'User status changed. Refresh and try again.',
      ],
      [`NOT_FOUND: profile ${TARGET_ID} does not exist`, 404, 'User not found'],
      ['VALIDATION: unit not found', 422, 'Unit not found'],
      [
        'VALIDATION: unit is required for this role',
        422,
        'unit_id is required for Dean and Requester roles',
      ],
      ['FORBIDDEN: only the CSO can re-send an invite', 403, 'Forbidden'],
    ])('re-invite maps %s → %i, no email', async (raised, status, message) => {
      existing('PENDING_ACTIVATION');
      fake.rpc.record_invite_resent = rpcError(raised);
      expect(await call(provision, post(path, body))).toEqual(
        failure(status, message)
      );
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('500 with a ref for an unrecognised re-invite RPC failure', async () => {
      existing('PENDING_ACTIVATION');
      fake.rpc.record_invite_resent = rpcError('connection reset');
      expectRef(await call(provision, post(path, body)));
      expect(mail.send).not.toHaveBeenCalled();
    });

    // CHANGED: a failed link used to be logged and still answer 200, after
    // the profile had already been reset. Now nothing changes.
    it('500 with a ref, and no RPC, when the re-invite link cannot be generated', async () => {
      existing('DEACTIVATED');
      fake.authAdmin.generateLink = { data: null, error: { message: 'x' } };
      expectRef(await call(provision, post(path, body)));
      expect(fake.rpcCalls).toHaveLength(0);
      expect(fake.authAdminCalls.map((c) => c.method)).toEqual([
        'generateLink',
      ]);
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('still 200 when the re-invite email fails', async () => {
      existing('PENDING_ACTIVATION');
      mail.send.mockRejectedValue(new Error('smtp down'));
      expect((await call(provision, post(path, body))).status).toBe(200);
    });
  });

  it('500 with a ref, and no RPC, when the invite link fails', async () => {
    fake.authAdmin.generateLink = { data: null, error: { message: 'x' } };
    expectRef(await call(provision, post(path, body)));
    expect(fake.rpcCalls).toHaveLength(0);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it.each([
    ['NOT_AUTHENTICATED', 401, 'Not authenticated'],
    ['FORBIDDEN: only CSO can provision users', 403, 'Forbidden'],
    [
      'AUTH_USER_NOT_FOUND: no auth.users row for email ada@unilag.edu.ng',
      409,
      'No auth account found for this email. Send an invite via Supabase Auth first, then provision.',
    ],
  ])('maps %s → %i', async (raised, status, message) => {
    fake.rpc.provision_user = rpcError(raised);
    expect(await call(provision, post(path, body))).toEqual(
      failure(status, message)
    );
    // CHANGED: the invite was emailed before provision_user and the auth
    // account was left behind when it failed.
    expect(mail.send).not.toHaveBeenCalled();
    expect(fake.authAdminCalls.map((c) => c.method)).toEqual([
      'generateLink',
      'deleteUser',
    ]);
    expect(fake.authAdminCalls[1].args).toEqual([AUTH_USER_ID]);
  });

  it('maps DUPLICATE_PROFILE → 409 and keeps the auth account', async () => {
    fake.rpc.provision_user = rpcError(
      'DUPLICATE_PROFILE: profile already exists for this user'
    );
    expect(await call(provision, post(path, body))).toEqual(
      failure(409, 'Email already registered')
    );
    // A profile owns that account; deleting it would cascade to the profile.
    expect(fake.authAdminCalls.map((c) => c.method)).toEqual(['generateLink']);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('500 with a ref for an unrecognised RPC failure, auth account deleted', async () => {
    fake.rpc.provision_user = rpcError('connection reset');
    expectRef(await call(provision, post(path, body)));
    expect(fake.authAdminCalls.map((c) => c.method)).toEqual([
      'generateLink',
      'deleteUser',
    ]);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('still answers the RPC error when the auth account cannot be deleted', async () => {
    fake.rpc.provision_user = rpcError('connection reset');
    fake.authAdmin.deleteUser = { data: null, error: { message: 'x' } };
    expectRef(await call(provision, post(path, body)));
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('500 with a ref when the RPC returns no row', async () => {
    fake.rpc.provision_user = { data: [], error: null };
    expectRef(await call(provision, post(path, body)));
  });

  it('201 with the new profile id, never the activation token', async () => {
    // CHANGED by the route() migration: the envelope status said 200 while
    // the HTTP status was 201.
    expect(await call(provision, post(path, body))).toEqual(
      success({ profile_id: TARGET_ID, status: 'PENDING_ACTIVATION' }, 201)
    );
    expect(fake.authAdminCalls[0].args[0]).toEqual({
      type: 'invite',
      email: 'ada@unilag.edu.ng',
    });
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(mail.send.mock.calls[0][0].to).toBe('ada@unilag.edu.ng');
  });

  it('still 201 when the invite email fails to send', async () => {
    mail.send.mockRejectedValue(new Error('smtp down'));
    expect((await call(provision, post(path, body))).status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/users
// ---------------------------------------------------------------------------

describe('GET /api/admin/users', () => {
  const path = '/api/admin/users';

  describeAuth('admin/users GET', listUsers, () => get(path), ['CSO']);

  beforeEach(() => asRole('CSO'));

  it('500 with a ref when the query fails', async () => {
    fake.tables.profiles = { data: null, error: { message: 'boom' } };
    expectRef(await call(listUsers, get(path)));
  });

  it('lists non-deactivated users, last_login_at as last_sign_in_at', async () => {
    fake.tables.profiles = {
      data: [
        {
          id: TARGET_ID,
          full_name: 'Ada Obi',
          institutional_email: 'ada@unilag.edu.ng',
          role: 'VERIFIER',
          status: 'ACTIVE',
          photo_url: null,
          created_at: '2026-10-01T00:00:00Z',
          last_login_at: '2026-10-12T08:00:00Z',
          department: null,
        },
      ],
      error: null,
    };
    expect(await call(listUsers, get(path))).toEqual(
      success({
        users: [
          {
            id: TARGET_ID,
            full_name: 'Ada Obi',
            institutional_email: 'ada@unilag.edu.ng',
            role: 'VERIFIER',
            status: 'ACTIVE',
            photo_url: null,
            created_at: '2026-10-01T00:00:00Z',
            department: null,
            last_sign_in_at: '2026-10-12T08:00:00Z',
          },
        ],
      })
    );
    const list = fake.queries.find(
      (q) => q.table === 'profiles' && hasOp(q.ops, 'neq')
    );
    expect(list?.ops).toContainEqual(['neq', ['status', 'DEACTIVATED']]);
  });

  it('rewrites stored photo URLs to the storage proxy', async () => {
    fake.tables.profiles = {
      data: [
        {
          id: TARGET_ID,
          photo_url: `https://x.supabase.co/storage/v1/object/public/passport-photos/${TARGET_ID}/photo.jpg`,
          last_login_at: null,
        },
      ],
      error: null,
    };
    const res = await call(listUsers, get(path));
    expect(res.body.data.users[0].photo_url).toMatch(
      /^\/api\/storage\/object\?bucket=passport-photos&path=/
    );
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/users/[id] (already on route(), PR #64)
// ---------------------------------------------------------------------------

describe('PATCH /api/admin/users/[id]', () => {
  const path = `/api/admin/users/${TARGET_ID}`;
  const params = { id: TARGET_ID };
  const body = { full_name: 'Ada Obi', unit_id: UNIT_ID };

  describeAuth(
    'admin/users/[id]',
    editUser,
    () => send('PATCH', path, body),
    ['CSO'],
    params
  );

  beforeEach(() => {
    asRole('CSO');
    fake.rpc.update_user_profile = {
      data: [{ profile_id: TARGET_ID, full_name: 'Ada Obi', unit_id: UNIT_ID }],
      error: null,
    };
  });

  it('404 User not found for a non-uuid id', async () => {
    expect(
      await call(editUser, send('PATCH', path, body), { id: 'nope' })
    ).toEqual(failure(404, 'User not found'));
  });

  it.each([
    ['not JSON', 'not json'],
    ['a blank name', { full_name: '   ' }],
    // CHANGED: an over-long name used to be accepted.
    ['a 121-character name', { full_name: 'a'.repeat(121) }],
    ['a non-uuid unit', { full_name: 'Ada', unit_id: 'x' }],
  ])('422 for %s', async (_label, bad) => {
    expect(await call(editUser, send('PATCH', path, bad), params)).toEqual(
      failure(422, 'Invalid request body')
    );
  });

  it.each([
    ['NOT_AUTHENTICATED', 401, 'Unauthorized'],
    ['FORBIDDEN: only the CSO can edit users', 403, 'Forbidden'],
    [`NOT_FOUND: profile ${TARGET_ID} does not exist`, 404, 'User not found'],
    [
      'CONFLICT: that unit already has a Dean',
      409,
      'That unit already has a Dean',
    ],
    [
      'VALIDATION: unit is required for this role',
      422,
      'Unit is required for this role',
    ],
    ['VALIDATION: unit not found', 422, 'Unit not found'],
    ['VALIDATION: full_name is required', 422, 'Name is required'],
    ['VALIDATION: something else', 422, 'Invalid request'],
  ])('maps %s → %i', async (raised, status, message) => {
    fake.rpc.update_user_profile = rpcError(raised);
    expect(await call(editUser, send('PATCH', path, body), params)).toEqual(
      failure(status, message)
    );
  });

  it('500 with a ref for an unrecognised RPC failure', async () => {
    fake.rpc.update_user_profile = rpcError('connection reset');
    expectRef(await call(editUser, send('PATCH', path, body), params));
  });

  it('returns the updated fields', async () => {
    expect(await call(editUser, send('PATCH', path, body), params)).toEqual(
      success({ profile_id: TARGET_ID, full_name: 'Ada Obi', unit_id: UNIT_ID })
    );
    expect(fake.rpcCalls[0]).toEqual({
      name: 'update_user_profile',
      args: {
        p_profile_id: TARGET_ID,
        p_full_name: 'Ada Obi',
        p_unit_id: UNIT_ID,
      },
    });
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/users/[id]/revoke (already on route(), PR #64)
// ---------------------------------------------------------------------------

describe('PATCH /api/admin/users/[id]/revoke', () => {
  const path = `/api/admin/users/${TARGET_ID}/revoke`;
  const params = { id: TARGET_ID };

  describeAuth(
    'admin/users/[id]/revoke',
    revoke,
    () => send('PATCH', path),
    ['CSO'],
    params
  );

  beforeEach(() => {
    asRole('CSO');
    fake.tables.profiles = { data: { status: 'ACTIVE' }, error: null };
    fake.rpc.deactivate_user = {
      data: [{ profile_id: TARGET_ID, status: 'DEACTIVATED' }],
      error: null,
    };
  });

  it('404 User not found for a non-uuid id', async () => {
    expect(await call(revoke, send('PATCH', path), { id: 'nope' })).toEqual(
      failure(404, 'User not found')
    );
  });

  it('404 User not found for an unknown user, nothing banned', async () => {
    fake.tables.profiles = { data: null, error: null };
    expect(await call(revoke, send('PATCH', path), params)).toEqual(
      failure(404, 'User not found')
    );
    expect(fake.authAdminCalls).toHaveLength(0);
  });

  it('409 when already deactivated', async () => {
    fake.tables.profiles = { data: { status: 'DEACTIVATED' }, error: null };
    expect(await call(revoke, send('PATCH', path), params)).toEqual(
      failure(409, 'User is already deactivated')
    );
  });

  it('500 with a ref when the ban fails, RPC not called', async () => {
    fake.authAdmin.updateUserById = { data: null, error: { message: 'x' } };
    expectRef(await call(revoke, send('PATCH', path), params));
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it('maps the RPC NOT_FOUND to 404 and lifts the ban', async () => {
    fake.rpc.deactivate_user = rpcError(
      `NOT_FOUND: profile ${TARGET_ID} does not exist`
    );
    expect(await call(revoke, send('PATCH', path), params)).toEqual(
      failure(404, 'User not found')
    );
    expect(fake.authAdminCalls.map((c) => c.args[1])).toEqual([
      { ban_duration: '876000h' },
      { ban_duration: 'none' },
    ]);
  });

  it('409 and the ban stays when the RPC raises CONFLICT', async () => {
    fake.rpc.deactivate_user = rpcError(
      'CONFLICT: user is already deactivated'
    );
    expect(await call(revoke, send('PATCH', path), params)).toEqual(
      failure(409, 'User is already deactivated')
    );
    expect(fake.authAdminCalls).toHaveLength(1);
  });

  it('bans, deactivates and returns DEACTIVATED', async () => {
    expect(await call(revoke, send('PATCH', path), params)).toEqual(
      success({ profile_id: TARGET_ID, status: 'DEACTIVATED' })
    );
    expect(fake.rpcCalls).toEqual([
      { name: 'deactivate_user', args: { p_profile_id: TARGET_ID } },
    ]);
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/users/[id]/resend-invite
// ---------------------------------------------------------------------------

describe('POST /api/admin/users/[id]/resend-invite', () => {
  const path = `/api/admin/users/${TARGET_ID}/resend-invite`;
  const params = { id: TARGET_ID };
  const target = (status: string, role = 'REQUESTER') => {
    fake.tables.profiles = {
      data: {
        id: TARGET_ID,
        institutional_email: 'ada@unilag.edu.ng',
        role,
        status,
      },
      error: null,
    };
  };

  describeAuth(
    'admin/users/[id]/resend-invite',
    resendInvite,
    () => post(path, {}),
    ['CSO'],
    params
  );

  beforeEach(() => {
    asRole('CSO');
    target('PENDING_ACTIVATION');
    fake.rpc.record_invite_resent = {
      data: [
        {
          profile_id: TARGET_ID,
          status: 'PENDING_ACTIVATION',
          role: 'REQUESTER',
          institutional_email: 'ada@unilag.edu.ng',
        },
      ],
      error: null,
    };
  });

  it('404 User not found for a non-uuid id', async () => {
    fake.tables.profiles = { data: null, error: { message: 'invalid uuid' } };
    expect(await call(resendInvite, post(path, {}), { id: 'nope' })).toEqual(
      failure(404, 'User not found')
    );
  });

  it('404 User not found for an unknown user', async () => {
    fake.tables.profiles = { data: null, error: null };
    expect(await call(resendInvite, post(path, {}), params)).toEqual(
      failure(404, 'User not found')
    );
  });

  it('409 when the user is already active', async () => {
    target('ACTIVE');
    expect(await call(resendInvite, post(path, {}), params)).toEqual(
      failure(409, 'User is already active')
    );
  });

  it('409 when the user is deactivated', async () => {
    target('DEACTIVATED');
    expect(await call(resendInvite, post(path, {}), params)).toEqual(
      failure(409, 'User is deactivated — reinstate them first')
    );
  });

  it('500 Could not generate link with a ref', async () => {
    fake.authAdmin.generateLink = { data: null, error: { message: 'x' } };
    const res = await call(resendInvite, post(path, {}), params);
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(
      /^Could not generate link\. Ref: [0-9a-f-]{36}$/
    );
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('500 Could not generate link: nothing recorded', async () => {
    fake.authAdmin.generateLink = { data: null, error: { message: 'x' } };
    await call(resendInvite, post(path, {}), params);
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it('500 Could not send email with a ref', async () => {
    mail.send.mockRejectedValue(new Error('smtp down'));
    const res = await call(resendInvite, post(path, {}), params);
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(
      /^Could not send email\. Ref: [0-9a-f-]{36}$/
    );
    // The link was generated and the re-send recorded before the send.
    expect(fake.rpcCalls.map((c) => c.name)).toEqual(['record_invite_resent']);
  });

  it.each([
    ['CONFLICT: user is already active', 409, 'User is already active'],
    [
      'CONFLICT: user is deactivated',
      409,
      'User is deactivated — reinstate them first',
    ],
    [`NOT_FOUND: profile ${TARGET_ID} does not exist`, 404, 'User not found'],
    ['FORBIDDEN: only the CSO can re-send an invite', 403, 'Forbidden'],
  ])('maps %s → %i, no email', async (raised, status, message) => {
    fake.rpc.record_invite_resent = rpcError(raised);
    expect(await call(resendInvite, post(path, {}), params)).toEqual(
      failure(status, message)
    );
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('500 with a ref, no email, for an unrecognised RPC failure', async () => {
    fake.rpc.record_invite_resent = rpcError('connection reset');
    expectRef(await call(resendInvite, post(path, {}), params));
    expect(mail.send).not.toHaveBeenCalled();
  });

  it.each([
    ['DEAN', '/dean/onboarding'],
    ['REQUESTER', '/activate'],
  ])('re-sends a %s invite pointing at %s', async (role, next) => {
    target('PENDING_ACTIVATION', role);
    expect(await call(resendInvite, post(path, {}), params)).toEqual(
      success({ profile_id: TARGET_ID, status: 'PENDING_ACTIVATION' })
    );
    expect(fake.authAdminCalls[0].args[0]).toEqual({
      type: 'magiclink',
      email: 'ada@unilag.edu.ng',
    });
    expect(JSON.stringify(mail.send.mock.calls[0][0])).toContain(
      encodeURIComponent(next)
    );
    // CHANGED: a re-sent invite wrote no audit entry; record_invite_resent
    // writes USER_INVITE_RESENT, with the CSO's own session.
    expect(fake.rpcCalls).toEqual([
      { name: 'record_invite_resent', args: { p_profile_id: TARGET_ID } },
    ]);
  });
});
