// @vitest-environment node
// Contract for the self-service profile routes: /api/profile/me (GET, PATCH),
// /api/profile/photo (POST, DELETE) and /api/profile/notification-preferences
// (GET, PATCH). Pins the status and message for every auth outcome, bad body
// or upload, storage / query failure and success shape, plus what each route
// is allowed to write — these routes let any signed-in user change their own
// row, so the write payloads are part of the contract. Written against the
// routes before they moved onto route(); kept as the regression net after.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as getMe, PATCH as patchMe } from '@/app/api/profile/me/route';
import {
  GET as getPrefs,
  PATCH as patchPrefs,
} from '@/app/api/profile/notification-preferences/route';
import {
  DELETE as deletePhoto,
  POST as postPhoto,
} from '@/app/api/profile/photo/route';
import { logger } from '@/lib/logger';

import {
  call,
  expectRef,
  failure,
  fake,
  get,
  multipart,
  publicUrl,
  resetFake,
  send,
  success,
  USER_ID,
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

const OTHER_ID = '99999999-9999-4999-8999-999999999999';
const DB_TEXT = 'relation "profiles" violates something internal';

const opArgs = (ops: Op[], method: string) =>
  ops.find(([m]) => m === method)?.[1];

// The table queries a route made, excluding route()'s own role lookup.
const queriesOn = (table: string) =>
  fake.queries.filter(
    (q) =>
      q.table === table &&
      !q.ops.some(
        ([m, args]) => m === 'select' && String(args[0]).startsWith('role')
      )
  );

const image = (name = 'me.png', type = 'image/png', size = 16) =>
  new File([new Uint8Array(size)], name, { type });

const expectNoLeak = (body: unknown) => {
  expect(JSON.stringify(body)).not.toContain(DB_TEXT);
};

beforeEach(() => {
  resetFake();
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
});

// ---------------------------------------------------------------------------
// GET /api/profile/me
// ---------------------------------------------------------------------------

describe('GET /api/profile/me', () => {
  const path = '/api/profile/me';
  const row = {
    id: USER_ID,
    full_name: 'Dr. Bakare',
    institutional_email: 'bakare@unilag.edu.ng',
    role: 'DEAN',
    status: 'ACTIVE',
    photo_url: publicUrl('passport-photos', `${USER_ID}/passport.jpg`),
    signature_ref_url: publicUrl('hod-signatures', `${USER_ID}/signature.png`),
    stamp_ref_url: null,
    unit_id: 'unit-1',
    unit: { id: 'unit-1', name: 'Faculty of Engineering' },
  };

  beforeEach(() => {
    fake.tables.profiles = { data: row, error: null };
  });

  it('401 Unauthorized with no session', async () => {
    fake.user = null;
    expect(await call(getMe, get(path))).toEqual(failure(401, 'Unauthorized'));
  });

  // CHANGED: was 404 'Profile not found'. A session with no profile row is
  // unauthenticated as far as the app is concerned, as on every other route.
  it('401 Unauthorized when the user has no profile row', async () => {
    fake.profile = null;
    fake.tables.profiles = { data: null, error: null };
    expect(await call(getMe, get(path))).toEqual(failure(401, 'Unauthorized'));
  });

  // CHANGED: was 404 'Profile not found'. A failed query is not a missing
  // profile; it is now a ref'd 500, logged with the database error.
  it('500 with a ref when the query fails', async () => {
    fake.tables.profiles = { data: null, error: { message: DB_TEXT } };
    const res = await call(getMe, get(path));
    expectRef(res);
    expectNoLeak(res.body);
  });

  it("returns the caller's own profile, with storage URLs proxied", async () => {
    const res = await call(getMe, get(path));
    expect(res).toEqual(
      success({
        profile: {
          ...row,
          photo_url: `/api/storage/object?bucket=passport-photos&path=${USER_ID}%2Fpassport.jpg`,
          signature_ref_url: `/api/storage/object?bucket=hod-signatures&path=${USER_ID}%2Fsignature.png`,
          stamp_ref_url: null,
        },
      })
    );
    const [query] = queriesOn('profiles');
    expect(query.client).toBe('server');
    expect(opArgs(query.ops, 'eq')).toEqual(['id', USER_ID]);
  });

  it('never returns a raw storage URL, even an unrecognised one', async () => {
    fake.tables.profiles = {
      data: { ...row, photo_url: 'https://evil.example/x.png' },
      error: null,
    };
    const res = await call(getMe, get(path));
    expect(res.body.data.profile.photo_url).toBeNull();
  });

  // CHANGED: a throw escaped as Next's bare 500; route() envelopes it.
  it('a throw becomes an enveloped 500 with a ref', async () => {
    fake.tables.profiles = () => {
      throw new Error('boom');
    };
    expectRef(await call(getMe, get(path)));
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/profile/me
// ---------------------------------------------------------------------------

describe('PATCH /api/profile/me', () => {
  const path = '/api/profile/me';
  const patch = (body: unknown) => send('PATCH', path, body);

  beforeEach(() => {
    fake.tables.profiles = { data: null, error: null };
  });

  it('401 Unauthorized with no session', async () => {
    fake.user = null;
    expect(await call(patchMe, patch({ full_name: 'X' }))).toEqual(
      failure(401, 'Unauthorized')
    );
  });

  // CHANGED: was 200 with an update that matched no row.
  it('401 Unauthorized when the user has no profile row', async () => {
    fake.profile = null;
    expect(await call(patchMe, patch({ full_name: 'X' }))).toEqual(
      failure(401, 'Unauthorized')
    );
    expect(queriesOn('profiles')).toHaveLength(0);
  });

  it('422 Invalid JSON for an unparseable body', async () => {
    expect(await call(patchMe, patch('{not json'))).toEqual(
      failure(422, 'Invalid JSON')
    );
  });

  for (const body of [
    {},
    { full_name: '' },
    { full_name: '   ' },
    { full_name: 7 },
    null,
  ]) {
    it(`422 full_name is required for ${JSON.stringify(body)}`, async () => {
      expect(await call(patchMe, patch(body))).toEqual(
        failure(422, 'full_name is required')
      );
      expect(queriesOn('profiles')).toHaveLength(0);
    });
  }

  // CHANGED: there was no maximum. The name flows into audit actor_name and
  // into emails, so it is now bounded by the shared FULL_NAME_MAX (120).
  it('422 for a name over 120 characters', async () => {
    expect(await call(patchMe, patch({ full_name: 'a'.repeat(121) }))).toEqual(
      failure(422, 'Full name must be 120 characters or fewer.')
    );
    expect(queriesOn('profiles')).toHaveLength(0);
  });

  it('accepts exactly 120 characters, measured after trimming', async () => {
    const name = 'a'.repeat(120);
    expect(await call(patchMe, patch({ full_name: `  ${name}  ` }))).toEqual(
      success({ full_name: name })
    );
  });

  it("updates only full_name, trimmed, on the caller's own row with the user session", async () => {
    const res = await call(
      patchMe,
      patch({
        full_name: '  Ada Obi  ',
        role: 'CSO',
        status: 'ACTIVE',
        photo_url: 'https://evil.example/x.png',
        id: OTHER_ID,
      })
    );
    expect(res).toEqual(success({ full_name: 'Ada Obi' }));
    const [query] = queriesOn('profiles');
    expect(query.client).toBe('server');
    expect(opArgs(query.ops, 'update')).toEqual([{ full_name: 'Ada Obi' }]);
    expect(opArgs(query.ops, 'eq')).toEqual(['id', USER_ID]);
  });

  it('500 Failed to update profile when the update fails', async () => {
    fake.tables.profiles = { data: null, error: { message: DB_TEXT } };
    const res = await call(patchMe, patch({ full_name: 'Ada' }));
    expect(res).toEqual(failure(500, 'Failed to update profile'));
    expectNoLeak(res.body);
  });

  // CHANGED: a throw escaped as Next's bare 500; route() envelopes it.
  it('a throw becomes an enveloped 500 with a ref', async () => {
    fake.tables.profiles = () => {
      throw new Error('boom');
    };
    expectRef(await call(patchMe, patch({ full_name: 'Ada' })));
  });
});

// ---------------------------------------------------------------------------
// POST /api/profile/photo
// ---------------------------------------------------------------------------

describe('POST /api/profile/photo', () => {
  const path = '/api/profile/photo';
  const upload = (fields: Record<string, string | File>) =>
    multipart('POST', path, fields);

  it('401 Unauthorized with no session', async () => {
    fake.user = null;
    expect(await call(postPhoto, upload({ photo: image() }))).toEqual(
      failure(401, 'Unauthorized')
    );
    expect(fake.storageCalls).toHaveLength(0);
  });

  // CHANGED: was 200 after uploading a file and "saving" it to no row.
  it('401 Unauthorized when the user has no profile row', async () => {
    fake.profile = null;
    expect(await call(postPhoto, upload({ photo: image() }))).toEqual(
      failure(401, 'Unauthorized')
    );
    expect(fake.storageCalls).toHaveLength(0);
  });

  it('422 Invalid form data for a non-multipart body', async () => {
    expect(await call(postPhoto, send('POST', path, { photo: 'x' }))).toEqual(
      failure(422, 'Invalid form data')
    );
  });

  it('422 A photo file is required with no file', async () => {
    expect(await call(postPhoto, upload({}))).toEqual(
      failure(422, 'A photo file is required')
    );
  });

  it('422 A photo file is required when photo is a plain field', async () => {
    expect(await call(postPhoto, upload({ photo: 'not a file' }))).toEqual(
      failure(422, 'A photo file is required')
    );
  });

  it('422 File must be an image for a non-image type', async () => {
    expect(
      await call(postPhoto, upload({ photo: image('a.txt', 'text/plain') }))
    ).toEqual(failure(422, 'File must be an image'));
    expect(fake.storageCalls).toHaveLength(0);
  });

  it('413 Photo must be under 5 MB', async () => {
    const big = image('big.png', 'image/png', 5 * 1024 * 1024 + 1);
    expect(await call(postPhoto, upload({ photo: big }))).toEqual(
      failure(413, 'Photo must be under 5 MB')
    );
    expect(fake.storageCalls).toHaveLength(0);
  });

  it("uploads to the caller's own folder and stores the canonical URL", async () => {
    fake.tables.profiles = { data: null, error: null };
    const res = await call(postPhoto, upload({ photo: image('Me.PNG') }));

    expect(res.status).toBe(200);
    expect(res.body.data.photo_url).toMatch(
      new RegExp(
        `^/api/storage/object\\?bucket=passport-photos&path=${USER_ID}%2Fpassport\\.png&v=\\d+$`
      )
    );

    const uploadCall = fake.storageCalls.find((c) => c.method === 'upload');
    expect(uploadCall).toMatchObject({
      client: 'admin',
      bucket: 'passport-photos',
    });
    expect(uploadCall?.args[0]).toBe(`${USER_ID}/passport.png`);
    expect(uploadCall?.args[2]).toEqual({
      contentType: 'image/png',
      upsert: true,
    });

    const [update] = queriesOn('profiles');
    expect(update.client).toBe('admin');
    expect(opArgs(update.ops, 'update')).toEqual([
      { photo_url: publicUrl('passport-photos', `${USER_ID}/passport.png`) },
    ]);
    expect(opArgs(update.ops, 'eq')).toEqual(['id', USER_ID]);
  });

  it('falls back to .jpg for a filename with no usable extension', async () => {
    await call(postPhoto, upload({ photo: image('scan copy', 'image/jpeg') }));
    const uploadCall = fake.storageCalls.find((c) => c.method === 'upload');
    expect(uploadCall?.args[0]).toBe(`${USER_ID}/passport.jpg`);
  });

  it('500 Photo upload failed when the upload fails', async () => {
    fake.storage.upload = { data: null, error: { message: DB_TEXT } };
    const res = await call(postPhoto, upload({ photo: image() }));
    expect(res).toEqual(failure(500, 'Photo upload failed'));
    expectNoLeak(res.body);
    expect(queriesOn('profiles')).toHaveLength(0);
  });

  it('500 Failed to save photo when the profile update fails', async () => {
    fake.tables.profiles = { data: null, error: { message: DB_TEXT } };
    const res = await call(postPhoto, upload({ photo: image() }));
    expect(res).toEqual(failure(500, 'Failed to save photo'));
    expectNoLeak(res.body);
  });

  // CHANGED: a throw escaped as Next's bare 500; route() envelopes it.
  it('a throw becomes an enveloped 500 with a ref', async () => {
    fake.tables.profiles = () => {
      throw new Error('boom');
    };
    expectRef(await call(postPhoto, upload({ photo: image() })));
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/profile/photo
// ---------------------------------------------------------------------------

describe('DELETE /api/profile/photo', () => {
  const path = '/api/profile/photo';
  const del = () => send('DELETE', path);

  beforeEach(() => {
    fake.storage.list = {
      data: [{ name: 'passport.jpg' }, { name: 'passport.png' }],
      error: null,
    };
    fake.tables.profiles = { data: null, error: null };
  });

  it('401 Unauthorized with no session', async () => {
    fake.user = null;
    expect(await call(deletePhoto, del())).toEqual(
      failure(401, 'Unauthorized')
    );
    expect(fake.storageCalls).toHaveLength(0);
  });

  // CHANGED: was 200.
  it('401 Unauthorized when the user has no profile row', async () => {
    fake.profile = null;
    expect(await call(deletePhoto, del())).toEqual(
      failure(401, 'Unauthorized')
    );
    expect(fake.storageCalls).toHaveLength(0);
  });

  it("removes every file in the caller's own folder and clears photo_url", async () => {
    expect(await call(deletePhoto, del())).toEqual(success(null));

    const list = fake.storageCalls.find((c) => c.method === 'list');
    expect(list).toMatchObject({
      client: 'admin',
      bucket: 'passport-photos',
      args: [USER_ID],
    });
    const remove = fake.storageCalls.find((c) => c.method === 'remove');
    expect(remove?.args[0]).toEqual([
      `${USER_ID}/passport.jpg`,
      `${USER_ID}/passport.png`,
    ]);

    const [update] = queriesOn('profiles');
    expect(update.client).toBe('admin');
    expect(opArgs(update.ops, 'update')).toEqual([{ photo_url: null }]);
    expect(opArgs(update.ops, 'eq')).toEqual(['id', USER_ID]);
  });

  it('skips the remove when the folder is empty', async () => {
    fake.storage.list = { data: [], error: null };
    expect(await call(deletePhoto, del())).toEqual(success(null));
    expect(fake.storageCalls.some((c) => c.method === 'remove')).toBe(false);
  });

  it('still clears photo_url when listing the folder fails', async () => {
    fake.storage.list = { data: null, error: { message: DB_TEXT } };
    expect(await call(deletePhoto, del())).toEqual(success(null));
    expect(queriesOn('profiles')).toHaveLength(1);
  });

  it('500 Failed to delete photo when the remove fails', async () => {
    fake.storage.remove = { data: null, error: { message: DB_TEXT } };
    const res = await call(deletePhoto, del());
    expect(res).toEqual(failure(500, 'Failed to delete photo'));
    expectNoLeak(res.body);
    expect(queriesOn('profiles')).toHaveLength(0);
  });

  it('500 Failed to clear photo when the profile update fails', async () => {
    fake.tables.profiles = { data: null, error: { message: DB_TEXT } };
    const res = await call(deletePhoto, del());
    expect(res).toEqual(failure(500, 'Failed to clear photo'));
    expectNoLeak(res.body);
  });

  // CHANGED: a throw escaped as Next's bare 500; route() envelopes it.
  it('a throw becomes an enveloped 500 with a ref', async () => {
    fake.tables.profiles = () => {
      throw new Error('boom');
    };
    expectRef(await call(deletePhoto, del()));
  });
});

// ---------------------------------------------------------------------------
// GET /api/profile/notification-preferences
// ---------------------------------------------------------------------------

describe('GET /api/profile/notification-preferences', () => {
  const path = '/api/profile/notification-preferences';
  const DEFAULTS = {
    key_issued_in_app: true,
    overdue_email: true,
    weekend_decided_email: true,
    weekend_submitted_in_app: true,
    weekend_submitted_email: true,
    signature_mismatch_email: true,
    digest_email: false,
  };

  it('401 Unauthorized with no session', async () => {
    fake.user = null;
    expect(await call(getPrefs, get(path))).toEqual(
      failure(401, 'Unauthorized')
    );
  });

  // CHANGED: was 200 with the defaults.
  it('401 Unauthorized when the user has no profile row', async () => {
    fake.profile = null;
    expect(await call(getPrefs, get(path))).toEqual(
      failure(401, 'Unauthorized')
    );
  });

  it('defaults when no row exists: all true except digest_email', async () => {
    fake.tables.notification_preferences = { data: null, error: null };
    expect(await call(getPrefs, get(path))).toEqual(success(DEFAULTS));
  });

  it("returns the caller's own row with the user session", async () => {
    const row = { ...DEFAULTS, overdue_email: false, digest_email: true };
    fake.tables.notification_preferences = { data: row, error: null };
    expect(await call(getPrefs, get(path))).toEqual(success(row));

    const [query] = queriesOn('notification_preferences');
    expect(query.client).toBe('server');
    expect(opArgs(query.ops, 'eq')).toEqual(['profile_id', USER_ID]);
  });

  it('500 Failed to load preferences when the query fails', async () => {
    fake.tables.notification_preferences = {
      data: null,
      error: { message: DB_TEXT },
    };
    const res = await call(getPrefs, get(path));
    expect(res).toEqual(failure(500, 'Failed to load preferences'));
    expectNoLeak(res.body);
  });

  // CHANGED: a throw escaped as Next's bare 500; route() envelopes it.
  it('a throw becomes an enveloped 500 with a ref', async () => {
    fake.tables.notification_preferences = () => {
      throw new Error('boom');
    };
    expectRef(await call(getPrefs, get(path)));
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/profile/notification-preferences
// ---------------------------------------------------------------------------

describe('PATCH /api/profile/notification-preferences', () => {
  const path = '/api/profile/notification-preferences';
  const patch = (body: unknown) => send('PATCH', path, body);

  beforeEach(() => {
    fake.tables.notification_preferences = { data: null, error: null };
  });

  it('401 Unauthorized with no session', async () => {
    fake.user = null;
    expect(await call(patchPrefs, patch({ overdue_email: false }))).toEqual(
      failure(401, 'Unauthorized')
    );
  });

  // CHANGED: was 200 (and, against the real database, a foreign-key failure
  // on the upsert).
  it('401 Unauthorized when the user has no profile row', async () => {
    fake.profile = null;
    expect(await call(patchPrefs, patch({ overdue_email: false }))).toEqual(
      failure(401, 'Unauthorized')
    );
    expect(queriesOn('notification_preferences')).toHaveLength(0);
  });

  for (const [label, body] of [
    ['unparseable JSON', '{not json'],
    ['an empty body', {}],
    ['a non-boolean value', { overdue_email: 'no' }],
    ['only unknown fields', { profile_id: OTHER_ID }],
  ] as const) {
    it(`422 Invalid request body for ${label}`, async () => {
      expect(await call(patchPrefs, patch(body))).toEqual(
        failure(422, 'Invalid request body')
      );
      expect(queriesOn('notification_preferences')).toHaveLength(0);
    });
  }

  it("upserts only the provided columns on the caller's own row", async () => {
    const res = await call(
      patchPrefs,
      patch({ overdue_email: false, digest_email: true })
    );
    expect(res).toEqual(success({ overdue_email: false, digest_email: true }));

    const [query] = queriesOn('notification_preferences');
    expect(query.client).toBe('server');
    expect(opArgs(query.ops, 'upsert')).toEqual([
      { profile_id: USER_ID, overdue_email: false, digest_email: true },
      { onConflict: 'profile_id' },
    ]);
  });

  it("ignores a profile_id in the body: the row is always the caller's", async () => {
    const res = await call(
      patchPrefs,
      patch({ profile_id: OTHER_ID, digest_email: true })
    );
    expect(res).toEqual(success({ digest_email: true }));
    const [query] = queriesOn('notification_preferences');
    expect(opArgs(query.ops, 'upsert')?.[0]).toEqual({
      profile_id: USER_ID,
      digest_email: true,
    });
  });

  it('500 Failed to save preferences when the upsert fails', async () => {
    fake.tables.notification_preferences = {
      data: null,
      error: { message: DB_TEXT },
    };
    const res = await call(patchPrefs, patch({ overdue_email: false }));
    expect(res).toEqual(failure(500, 'Failed to save preferences'));
    expectNoLeak(res.body);
  });

  // CHANGED: a throw escaped as Next's bare 500; route() envelopes it.
  it('a throw becomes an enveloped 500 with a ref', async () => {
    fake.tables.notification_preferences = () => {
      throw new Error('boom');
    };
    expectRef(await call(patchPrefs, patch({ overdue_email: false })));
  });
});
