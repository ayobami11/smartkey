// Shared fake Supabase client for the route contract tests (keys, shifts,
// reports, incidents). Adapted from the requests/* harness in batch 1, with
// insert/update/is added for the routes here that write tables directly.
//
// The fake records every query a route builds and answers it from `fake`,
// which each test configures. It is deliberately loose: any chain of
// select/eq/in/is/gte/lte/lt/order/limit/insert/update is accepted, and the answer is chosen by
// table (or by a function of the recorded ops when one table is read twice).
import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

export const USER_ID = '11111111-1111-4111-8111-111111111111';
export const KEY_ID = '33333333-3333-4333-8333-333333333333';
export const SHIFT_ID = '44444444-4444-4444-8444-444444444444';
export const REPORT_ID = '55555555-5555-4555-8555-555555555555';

export type Op = [method: string, args: unknown[]];
export type Result = {
  data?: unknown;
  error?: { message: string } | null;
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
  } as { role: string; unit_id: string | null; full_name: string } | null,
  tables: {} as Record<string, Answer>,
  rpc: {} as Record<string, Result>,
  queries: [] as QueryCall[],
  rpcCalls: [] as { name: string; args: unknown }[],
});

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
    'in',
    'is',
    'gte',
    'lte',
    'lt',
    'order',
    'limit',
    'insert',
    'update',
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
  },
  from: (table: string) => builder(client, table),
  rpc: async (name: string, args: unknown) => {
    fake.rpcCalls.push({ name, args });
    return fake.rpc[name] ?? { data: null, error: null };
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
  return { status: res.status, body: await res.json() };
};

export const post = (path: string, body: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

export const get = (path: string) =>
  new NextRequest(`http://localhost${path}`, { method: 'GET' });

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
 * session with no profile row → 401, each role outside `allowed` → 403.
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
