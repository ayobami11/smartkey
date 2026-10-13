import { createHash, timingSafeEqual } from 'node:crypto';

import type { User } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import type * as z from 'zod';

import { type HttpError, respond } from '@/lib/http/respond';
import { createServerClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';

export type Role = Database['public']['Enums']['user_role'];

// The columns every role-gated route has needed from the caller's profile.
export type RouteProfile = {
  role: Role;
  unit_id: string | null;
  full_name: string;
};

export type ServerClient = Awaited<ReturnType<typeof createServerClient>>;

type Schema = z.ZodType;
type Parsed<S> = S extends z.ZodType ? z.output<S> : undefined;

// What Next.js 16 calls a route export with. `params` is typed `unknown`
// here so one handler type satisfies both static and dynamic routes (Next
// checks exports against `{ params: Promise<ParamMap[Route]> }`); the
// wrapper's own `params` schema gives handlers the typed value.
export type RouteHandler = (
  request: NextRequest,
  context: { params: Promise<unknown> }
) => Promise<Response>;

type BaseCtx<B, P> = { request: NextRequest; body: B; params: P };

export type PublicCtx<B = undefined, P = undefined> = BaseCtx<B, P>;

export type UserCtx<B = undefined, P = undefined> = BaseCtx<B, P> & {
  supabase: ServerClient;
  user: User;
};

export type RoleCtx<B = undefined, P = undefined> = UserCtx<B, P> & {
  profile: RouteProfile;
};

type HandlerResult = Response | Promise<Response>;

type BaseOptions<B extends Schema | undefined, P extends Schema | undefined> = {
  /** Log prefix, e.g. `'requests/hod-decision'`. */
  name: string;
  body?: B;
  params?: P;
  /** Response when `params` fails validation. Default 404 'Not found'. */
  paramsError?: HttpError;
};

type RoleOptions<
  B extends Schema | undefined,
  P extends Schema | undefined,
> = BaseOptions<B, P> & {
  auth: 'user';
  roles: readonly Role[];
  handler: (ctx: RoleCtx<Parsed<B>, Parsed<P>>) => HandlerResult;
};

type UserOptions<
  B extends Schema | undefined,
  P extends Schema | undefined,
> = BaseOptions<B, P> & {
  auth: 'user';
  roles?: undefined;
  handler: (ctx: UserCtx<Parsed<B>, Parsed<P>>) => HandlerResult;
};

type OpenOptions<
  B extends Schema | undefined,
  P extends Schema | undefined,
> = BaseOptions<B, P> & {
  /**
   * 'public': no session. 'cron': `Authorization: Bearer ${CRON_SECRET}`.
   * Neither gets a Supabase client — handlers that need one call
   * createAdminClient themselves, so the service role is never implicit.
   */
  auth: 'public' | 'cron';
  roles?: undefined;
  handler: (ctx: PublicCtx<Parsed<B>, Parsed<P>>) => HandlerResult;
};

type AnyOptions = BaseOptions<Schema | undefined, Schema | undefined> & {
  auth: 'user' | 'public' | 'cron';
  roles?: readonly Role[];
  handler: (ctx: never) => HandlerResult;
};

const NOT_FOUND: HttpError = { status: 404, message: 'Not found' };

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * Checks `Authorization: Bearer ${CRON_SECRET}` in constant time. Returns the
 * rejection response, or null when the caller is the scheduler.
 */
export const cronAuth = (request: NextRequest, name: string) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return respond.internal(`${name}: CRON_SECRET not configured`);
  }
  const header = request.headers.get('authorization') ?? '';
  // Hashing first gives both sides the same length, which timingSafeEqual
  // requires, without leaking the secret's length through an early return.
  if (!timingSafeEqual(digest(header), digest(`Bearer ${secret}`))) {
    return respond.fail(401, 'Unauthorized');
  }
  return null;
};

const run = async (
  options: AnyOptions,
  request: NextRequest,
  context: { params: Promise<unknown> }
): Promise<Response> => {
  const { auth, roles, handler } = options;
  const ctx: Record<string, unknown> = { request };

  if (auth === 'cron') {
    const rejection = cronAuth(request, options.name);
    if (rejection) return rejection;
  }

  if (auth === 'user') {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return respond.fail(401, 'Unauthorized');
    ctx.supabase = supabase;
    ctx.user = user;

    if (roles) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, unit_id, full_name')
        .eq('id', user.id)
        .single();
      if (!profile) return respond.fail(401, 'Unauthorized');
      if (!roles.includes(profile.role)) return respond.fail(403, 'Forbidden');
      ctx.profile = profile;
    }
  }

  if (options.params) {
    const parsed = options.params.safeParse(await context.params);
    if (!parsed.success) return respond.error(options.paramsError ?? NOT_FOUND);
    ctx.params = parsed.data;
  }

  if (options.body) {
    const raw: unknown = await request.json().catch(() => null);
    const parsed = options.body.safeParse(raw);
    if (!parsed.success) return respond.fail(422, 'Invalid request body');
    ctx.body = parsed.data;
  }

  return (handler as (ctx: unknown) => HandlerResult)(ctx);
};

/**
 * Wraps an App Router handler with the checks every SmartKey route repeats,
 * in a fixed order: auth (session or cron secret) → profile + role → params
 * → JSON body → handler. Any throw becomes an enveloped 500 with a ref.
 *
 * `roles` omitted means no profile query at all — the handler gets `user` but
 * no `profile`. Routes that read multipart bodies omit `body` and read
 * `ctx.request` themselves.
 */
export function route<
  B extends Schema | undefined = undefined,
  P extends Schema | undefined = undefined,
>(options: RoleOptions<B, P>): RouteHandler;
export function route<
  B extends Schema | undefined = undefined,
  P extends Schema | undefined = undefined,
>(options: UserOptions<B, P>): RouteHandler;
export function route<
  B extends Schema | undefined = undefined,
  P extends Schema | undefined = undefined,
>(options: OpenOptions<B, P>): RouteHandler;
export function route(options: AnyOptions): RouteHandler {
  return async (request, context) => {
    try {
      return await run(options, request, context);
    } catch (e) {
      return respond.internal(`${options.name}: unhandled error`, {
        err: e instanceof Error ? e.message : String(e),
      });
    }
  };
}
