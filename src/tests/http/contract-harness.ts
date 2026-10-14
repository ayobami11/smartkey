// Shared fake Supabase client for the route contract tests (keys, shifts,
// reports, incidents, admin, ai, cron, profile). Adapted from the requests/*
// harness in batch 1, with insert/update/is added for the routes that write
// tables directly, neq + auth.admin (generateLink, updateUserById,
// deleteUser) for admin/*, gt + per-call RPC answers (a function of the args) for cron/*, and
// upsert + storage (upload/getPublicUrl/list/remove/download) for profile/*.
//
// The fake records every query a route builds and answers it from `fake`,
// which each test configures. It is deliberately loose: any chain of
// select/eq/neq/in/is/gt/gte/lte/lt/order/limit/insert/update/upsert is
// accepted, and the answer is chosen by table (or by a function of the
// recorded ops when one table is read twice).
import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

export const USER_ID = '11111111-1111-4111-8111-111111111111';
export const KEY_ID = '33333333-3333-4333-8333-333333333333';
export const SHIFT_ID = '44444444-4444-4444-8444-444444444444';
export const REPORT_ID = '55555555-5555-4555-8555-555555555555';
// The auth account generateLink({ type: 'invite' }) answers with.
export const AUTH_USER_ID = '88888888-8888-4888-8888-888888888888';

export type Op = [method: string, args: unknown[]];
export type Result = {
  data?: unknown;
  // `code` is the Postgres SQLSTATE PostgREST passes through (e.g. 23505).
  error?: { message: string; code?: string } | null;
  count?: number | null;
};
type Answer = Result | ((ops: Op[]) => Result);

export type QueryCall = {
  client: 'server' | 'admin';
  table: string;
  ops: Op[];
};

export const REF_PATTERN = /^Internal error\. Ref: [0-9a-f-]{36}$/;

const freshState = () => ({
  user: { id: USER_ID } as { id: string } | null,
  // What route()'s / the old routes' own `profiles` role lookup returns.
  profile: {
    role: 'CSO',
    unit_id: 'unit-1',
    full_name: 'Dr. Bakare',
  } as {
    role: string;
    unit_id: string | null;
    full_name: string;
    status?: string;
  } | null,
  tables: {} as Record<string, Answer>,
  // A function answer sees the call's args, for an RPC called more than once
  // with different arguments in one request (cron/daily-digest).
  rpc: {} as Record<string, Result | ((args: unknown) => Result)>,
  queries: [] as QueryCall[],
  rpcCalls: [] as { name: string; args: unknown }[],
  // What the service-role client's auth.admin methods answer, and a record
  // of every call made to them.
  authAdmin: {
    generateLink: {
      data: {
        properties: { hashed_token: 'hashed', verification_type: 'invite' },
        user: { id: AUTH_USER_ID },
      },
      error: null,
    } as { data: unknown; error: { message: string } | null },
    updateUserById: { data: {}, error: null } as {
      data: unknown;
      error: { message: string } | null;
    },
    deleteUser: { data: {}, error: null } as {
      data: unknown;
      error: { message: string } | null;
    },
  },
  authAdminCalls: [] as { method: string; args: unknown[] }[],
  // What `client.storage.from(bucket).<method>()` answers, and every call.
  storage: {
    upload: { data: {}, error: null } as StorageAnswer,
    list: { data: [], error: null } as StorageAnswer,
    remove: { data: [], error: null } as StorageAnswer,
    download: {
      data: new Blob([new Uint8Array([1, 2, 3])]),
      error: null,
    } as StorageAnswer,
  },
  storageCalls: [] as StorageCall[],
});

type StorageAnswer = { data: unknown; error: { message: string } | null };
export type StorageCall = {
  client: QueryCall['client'];
  bucket: string;
  method: string;
  args: unknown[];
};

/** What the fake's getPublicUrl returns: a canonical public storage URL. */
export const publicUrl = (bucket: string, path: string) =>
  `https://project.supabase.co/storage/v1/object/public/${bucket}/${path}`;

export const fake = freshState();

export const resetFake = () => {
  Object.assign(fake, freshState());
};

const resolve = (table: string, ops: Op[]): Result => {
  const isRoleLookup =
    table === 'profiles' &&
    ops.some(
      ([m, args]) => m === 'select' && String(args[0]).startsWith('role')
    );
  if (isRoleLookup) return { data: fake.profile, error: null };
  const answer = fake.tables[table];
  if (!answer) return { data: null, error: null };
  return typeof answer === 'function' ? answer(ops) : answer;
};

const builder = (client: QueryCall['client'], table: string) => {
  const call: QueryCall = { client, table, ops: [] };
  fake.queries.push(call);
  const settle = () => Promise.resolve(resolve(table, call.ops));
  const chain: Record<string, unknown> = {};
  for (const method of [
    'select',
    'eq',
    'neq',
    'in',
    'is',
    'gt',
    'gte',
    'lte',
    'lt',
    'order',
    'limit',
    'insert',
    'update',
    'upsert',
  ]) {
    chain[method] = (...args: unknown[]) => {
      call.ops.push([method, args]);
      return chain;
    };
  }
  chain.single = () => {
    call.ops.push(['single', []]);
    return settle();
  };
  chain.maybeSingle = () => {
    call.ops.push(['maybeSingle', []]);
    return settle();
  };
  chain.then = (
    onFulfilled: (value: Result) => unknown,
    onRejected?: (reason: unknown) => unknown
  ) => settle().then(onFulfilled, onRejected);
  return chain;
};

export const makeClient = (client: QueryCall['client']) => ({
  auth: {
    getUser: vi.fn(async () => ({ data: { user: fake.user } })),
    admin: {
      generateLink: async (...args: unknown[]) => {
        fake.authAdminCalls.push({ method: 'generateLink', args });
        return fake.authAdmin.generateLink;
      },
      updateUserById: async (...args: unknown[]) => {
        fake.authAdminCalls.push({ method: 'updateUserById', args });
        return fake.authAdmin.updateUserById;
      },
      deleteUser: async (...args: unknown[]) => {
        fake.authAdminCalls.push({ method: 'deleteUser', args });
        return fake.authAdmin.deleteUser;
      },
    },
  },
  from: (table: string) => builder(client, table),
  storage: {
    from: (bucket: string) => {
      const record = (method: string, args: unknown[]) =>
        fake.storageCalls.push({ client, bucket, method, args });
      return {
        upload: async (...args: unknown[]) => {
          record('upload', args);
          return fake.storage.upload;
        },
        list: async (...args: unknown[]) => {
          record('list', args);
          return fake.storage.list;
        },
        remove: async (...args: unknown[]) => {
          record('remove', args);
          return fake.storage.remove;
        },
        download: async (...args: unknown[]) => {
          record('download', args);
          return fake.storage.download;
        },
        getPublicUrl: (path: string) => {
          record('getPublicUrl', [path]);
          return { data: { publicUrl: publicUrl(bucket, path) } };
        },
      };
    },
  },
  rpc: async (name: string, args: unknown) => {
    fake.rpcCalls.push({ name, args });
    const answer = fake.rpc[name];
    if (!answer) return { data: null, error: null };
    return typeof answer === 'function' ? answer(args) : answer;
  },
});

/** An RPC failure carrying the given raised message. */
export const rpcError = (message: string): Result => ({
  data: null,
  error: { message },
});

type Handler = (
  request: NextRequest,
  context: { params: Promise<unknown> }
) => Promise<Response>;

/** Calls a route export (old hand-rolled or route()-wrapped) uniformly. */
export const call = async (
  handler: unknown,
  request: NextRequest,
  params: Record<string, string> = {}
) => {
  const res = await (handler as Handler)(request, {
    params: Promise.resolve(params),
  });
  // A 204 has no body; everything else is a JSON envelope.
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

export const post = (path: string, body: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

export const get = (path: string) =>
  new NextRequest(`http://localhost${path}`, { method: 'GET' });

/** A JSON request with any method (PATCH, DELETE, …). */
export const send = (method: string, path: string, body?: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          body: typeof body === 'string' ? body : JSON.stringify(body),
          headers: { 'content-type': 'application/json' },
        }),
  });

/** A multipart request (the upload routes). */
export const multipart = (
  method: string,
  path: string,
  fields: Record<string, string | File>
) => {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  return new NextRequest(`http://localhost${path}`, { method, body: form });
};

/** The `{ data: null, error, status }` envelope an error response carries. */
export const failure = (status: number, error: string) => ({
  status,
  body: { data: null, error, status },
});

/** The `{ data, error: null, status }` envelope a success carries. */
export const success = (data: unknown, status = 200) => ({
  status,
  body: { data, error: null, status },
});

export type Role = 'CSO' | 'DEAN' | 'VERIFIER' | 'REQUESTER';
export const ROLES: Role[] = ['CSO', 'DEAN', 'VERIFIER', 'REQUESTER'];

export const asRole = (role: Role) => {
  fake.profile = { role, unit_id: 'unit-1', full_name: 'Test User' };
};

/** A ref'd 500: the only client-visible content is the correlation ref. */
export const expectRef = (res: {
  status: number;
  body: { error: string; status: number; data: unknown };
}) => {
  expect(res.status).toBe(500);
  expect(res.body).toMatchObject({ data: null, status: 500 });
  expect(res.body.error).toMatch(REF_PATTERN);
};

/**
 * The auth half of every role-gated route's contract: no session → 401, a
 * session with no profile row → 401, a DEACTIVATED profile → 401, each role
 * outside `allowed` → 403.
 * `makeRequest` is called fresh per case (a request body is single-use).
 */
export const describeAuth = (
  label: string,
  handler: unknown,
  makeRequest: () => NextRequest,
  allowed: Role[],
  params: Record<string, string> = {}
) => {
  describe(`${label} auth`, () => {
    it('401 Unauthorized with no session', async () => {
      fake.user = null;
      expect(await call(handler, makeRequest(), params)).toEqual(
        failure(401, 'Unauthorized')
      );
    });

    it('401 Unauthorized when the user has no profile', async () => {
      fake.profile = null;
      expect(await call(handler, makeRequest(), params)).toEqual(
        failure(401, 'Unauthorized')
      );
    });

    it('401 Unauthorized when the profile is DEACTIVATED', async () => {
      fake.profile = {
        role: allowed[0],
        unit_id: 'unit-1',
        full_name: 'Test User',
        status: 'DEACTIVATED',
      };
      expect(await call(handler, makeRequest(), params)).toEqual(
        failure(401, 'Unauthorized')
      );
    });

    for (const role of ROLES.filter((r) => !allowed.includes(r))) {
      it(`403 Forbidden for ${role}`, async () => {
        asRole(role);
        expect(await call(handler, makeRequest(), params)).toEqual(
          failure(403, 'Forbidden')
        );
      });
    }
  });
};
