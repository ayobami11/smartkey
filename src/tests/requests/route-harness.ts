// Shared fake Supabase client for the requests/* route contract tests.
//
// The fake records every query a route builds and answers it from `fake`,
// which each test configures. It is deliberately loose: any chain of
// select/eq/in/gte/lt/order/limit is accepted, and the answer is chosen by
// table (or by a function of the recorded ops when one table is read twice).
import { NextRequest } from 'next/server';
import { vi } from 'vitest';

export const USER_ID = '11111111-1111-4111-8111-111111111111';
export const REQUEST_ID = '22222222-2222-4222-8222-222222222222';
export const KEY_ID = '33333333-3333-4333-8333-333333333333';

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
    role: 'REQUESTER',
    unit_id: 'unit-1',
    full_name: 'Dr. Bakare',
  } as { role: string; unit_id: string | null; full_name: string } | null,
  tables: {} as Record<string, Answer>,
  rpc: {} as Record<string, Result>,
  signedUrl: {
    data: { signedUrl: 'https://signed.example/letter' },
    error: null,
  } as Result,
  queries: [] as QueryCall[],
  rpcCalls: [] as { name: string; args: unknown }[],
  // Which client made each RPC call, in order. Kept apart from rpcCalls so
  // the many exact `rpcCalls` assertions do not have to name a client.
  rpcClients: [] as { name: string; client: QueryCall['client'] }[],
  signCalls: [] as { bucket: string; path: string; ttl: number }[],
  // What storage download() answers, by object path. Unlisted paths answer
  // a small PNG, so a stored letter reads back as a real image by default.
  downloads: {} as Record<
    string,
    { data: Blob | null; error: { message: string } | null }
  >,
  downloadCalls: [] as { bucket: string; path: string }[],
});

const PNG_HEAD = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0,
]);

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
  for (const method of ['select', 'eq', 'in', 'gte', 'lt', 'order', 'limit']) {
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
    fake.rpcClients.push({ name, client });
    return fake.rpc[name] ?? { data: null, error: null };
  },
  storage: {
    from: (bucket: string) => ({
      createSignedUrl: async (path: string, ttl: number) => {
        fake.signCalls.push({ bucket, path, ttl });
        return fake.signedUrl;
      },
      download: async (path: string) => {
        fake.downloadCalls.push({ bucket, path });
        return (
          fake.downloads[path] ?? { data: new Blob([PNG_HEAD]), error: null }
        );
      },
    }),
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
