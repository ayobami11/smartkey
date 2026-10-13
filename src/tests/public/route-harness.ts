// Shared fake service-role client for the public/* route contract tests.
//
// Copied from the requests/* harness and trimmed to what the session-less
// routes use: no auth, no profile lookup, plus storage upload/getPublicUrl.
// The fake records every query, RPC and storage call a route makes and
// answers from `fake`, which each test configures. Any chain of
// select/eq/neq/order is accepted; the answer is chosen by table, or by a
// function of the recorded ops when a table is read twice.
import { NextRequest } from 'next/server';

export const REQUEST_ID = '22222222-2222-4222-8222-222222222222';
export const KEY_ID = '33333333-3333-4333-8333-333333333333';
export const TOKEN = '44444444-4444-4444-8444-444444444444';
export const UNIT_ID = '55555555-5555-4555-8555-555555555555';
export const DEAN_ID = '66666666-6666-4666-8666-666666666666';

export type Op = [method: string, args: unknown[]];
export type Result = {
  data?: unknown;
  error?: { message: string } | null;
};
type Answer = Result | ((ops: Op[]) => Result);

export type QueryCall = { table: string; ops: Op[] };

export const REF_PATTERN = /^Internal error\. Ref: [0-9a-f-]{36}$/;

// Every builder method the fake accepts. Anything that writes (update,
// insert, delete, upsert) is deliberately absent, so a route that tried one
// would throw — the GET tests rely on that to pin "GET never mutates".
const READ_METHODS = ['select', 'eq', 'neq', 'in', 'order', 'limit'];

const freshState = () => ({
  /** When set, createAdminClient() throws this. */
  adminThrows: null as Error | null,
  tables: {} as Record<string, Answer>,
  rpc: {} as Record<string, Result>,
  signedUrl: (path: string): Result => ({
    data: { signedUrl: `https://signed.example/${path}` },
    error: null,
  }),
  upload: { data: { path: 'x' }, error: null } as Result,
  queries: [] as QueryCall[],
  rpcCalls: [] as { name: string; args: unknown }[],
  signCalls: [] as { bucket: string; path: string; ttl: number }[],
  uploads: [] as { bucket: string; path: string; options: unknown }[],
});

export const fake = freshState();

export const resetFake = () => {
  Object.assign(fake, freshState());
};

const resolve = (table: string, ops: Op[]): Result => {
  const answer = fake.tables[table];
  if (!answer) return { data: null, error: null };
  return typeof answer === 'function' ? answer(ops) : answer;
};

const builder = (table: string) => {
  const call: QueryCall = { table, ops: [] };
  fake.queries.push(call);
  const settle = () => Promise.resolve(resolve(table, call.ops));
  const chain: Record<string, unknown> = {};
  for (const method of READ_METHODS) {
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

export const makeAdminClient = () => {
  if (fake.adminThrows) throw fake.adminThrows;
  return {
    from: (table: string) => builder(table),
    rpc: async (name: string, args: unknown) => {
      fake.rpcCalls.push({ name, args });
      return fake.rpc[name] ?? { data: null, error: null };
    },
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string, ttl: number) => {
          fake.signCalls.push({ bucket, path, ttl });
          return fake.signedUrl(path);
        },
        upload: async (path: string, _bytes: unknown, options: unknown) => {
          fake.uploads.push({ bucket, path, options });
          return fake.upload;
        },
        getPublicUrl: (path: string) => ({
          data: {
            publicUrl: `https://project.supabase.co/storage/v1/object/public/${bucket}/${path}`,
          },
        }),
      }),
    },
  };
};

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

export const post = (path: string, body?: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    body:
      body === undefined
        ? undefined
        : typeof body === 'string'
          ? body
          : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

export const postForm = (path: string, form: FormData) =>
  new NextRequest(`http://localhost${path}`, { method: 'POST', body: form });

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
