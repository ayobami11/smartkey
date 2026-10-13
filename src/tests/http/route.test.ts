// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod';

import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { logger } from '@/lib/logger';

const mocks = vi.hoisted(() => {
  const getUser = vi.fn();
  const single = vi.fn();
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { getUser, single, select, from };
});

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  })),
}));

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

const USER = { id: '11111111-1111-4111-8111-111111111111' };
const PROFILE = { role: 'DEAN', unit_id: 'u1', full_name: 'Dr. Bakare' };

const post = (body?: string, headers: Record<string, string> = {}) =>
  new NextRequest('http://localhost/api/test', {
    method: 'POST',
    body,
    headers,
  });

const ctx = (params: unknown = {}) => ({ params: Promise.resolve(params) });

const read = async (res: Response) => ({
  status: res.status,
  body: await res.json(),
});

beforeEach(() => {
  mocks.getUser.mockResolvedValue({ data: { user: USER } });
  mocks.single.mockResolvedValue({ data: PROFILE });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('route — user auth', () => {
  it('401s with no session, before anything else runs', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const handler = vi.fn();
    const res = await route({
      name: 't',
      auth: 'user',
      roles: ['DEAN'],
      handler,
    })(post('{}'), ctx());
    expect(await read(res)).toEqual({
      status: 401,
      body: { data: null, error: 'Unauthorized', status: 401 },
    });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it('401s when the user has no profile', async () => {
    mocks.single.mockResolvedValue({ data: null });
    const res = await route({
      name: 't',
      auth: 'user',
      roles: ['DEAN'],
      handler: () => respond.ok(null),
    })(post(), ctx());
    expect((await read(res)).status).toBe(401);
  });

  it('403s on the wrong role', async () => {
    mocks.single.mockResolvedValue({ data: { ...PROFILE, role: 'REQUESTER' } });
    const res = await route({
      name: 't',
      auth: 'user',
      roles: ['DEAN', 'CSO'],
      handler: () => respond.ok(null),
    })(post(), ctx());
    expect(await read(res)).toEqual({
      status: 403,
      body: { data: null, error: 'Forbidden', status: 403 },
    });
  });

  it('passes user, profile and supabase to the handler', async () => {
    const res = await route({
      name: 't',
      auth: 'user',
      roles: ['DEAN'],
      handler: ({ user, profile, supabase }) =>
        respond.ok({
          id: user.id,
          role: profile.role,
          hasClient: Boolean(supabase),
        }),
    })(post(), ctx());
    expect((await read(res)).body.data).toEqual({
      id: USER.id,
      role: 'DEAN',
      hasClient: true,
    });
    expect(mocks.select).toHaveBeenCalledWith('role, unit_id, full_name');
  });

  it('runs no profile query when roles is omitted', async () => {
    const res = await route({
      name: 't',
      auth: 'user',
      handler: ({ user }) => respond.ok({ id: user.id }),
    })(post(), ctx());
    expect(res.status).toBe(200);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

describe('route — body and params', () => {
  const body = z.object({ n: z.number() });

  it('422s on malformed JSON', async () => {
    const res = await route({
      name: 't',
      auth: 'user',
      body,
      handler: () => respond.ok(null),
    })(post('{not json'), ctx());
    expect(await read(res)).toEqual({
      status: 422,
      body: { data: null, error: 'Invalid request body', status: 422 },
    });
  });

  it('422s on a body that fails the schema', async () => {
    const res = await route({
      name: 't',
      auth: 'user',
      body,
      handler: () => respond.ok(null),
    })(post('{"n":"x"}'), ctx());
    expect(res.status).toBe(422);
  });

  it('hands the parsed body to the handler', async () => {
    const res = await route({
      name: 't',
      auth: 'user',
      body,
      handler: ({ body: b }) => respond.ok({ doubled: b.n * 2 }),
    })(post('{"n":21}'), ctx());
    expect((await read(res)).body.data).toEqual({ doubled: 42 });
  });

  it('checks auth before parsing the body', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const res = await route({
      name: 't',
      auth: 'user',
      body,
      handler: () => respond.ok(null),
    })(post('{not json'), ctx());
    expect(res.status).toBe(401);
  });

  it('checks the role before parsing the body', async () => {
    mocks.single.mockResolvedValue({ data: { ...PROFILE, role: 'VERIFIER' } });
    const res = await route({
      name: 't',
      auth: 'user',
      roles: ['DEAN'],
      body,
      handler: () => respond.ok(null),
    })(post('{not json'), ctx());
    expect(res.status).toBe(403);
  });

  const params = z.object({ id: z.uuid() });

  it('404s by default on bad params', async () => {
    const res = await route({
      name: 't',
      auth: 'public',
      params,
      handler: () => respond.ok(null),
    })(post(), ctx({ id: 'not-a-uuid' }));
    expect(await read(res)).toEqual({
      status: 404,
      body: { data: null, error: 'Not found', status: 404 },
    });
  });

  it('uses paramsError when given', async () => {
    const res = await route({
      name: 't',
      auth: 'public',
      params,
      paramsError: { status: 422, message: 'Bad id' },
      handler: () => respond.ok(null),
    })(post(), ctx({ id: 'nope' }));
    expect((await read(res)).body).toEqual({
      data: null,
      error: 'Bad id',
      status: 422,
    });
  });

  it('checks params before the body', async () => {
    const res = await route({
      name: 't',
      auth: 'public',
      params,
      body,
      handler: () => respond.ok(null),
    })(post('{not json'), ctx({ id: 'nope' }));
    expect(res.status).toBe(404);
  });

  it('hands the parsed params to the handler', async () => {
    const id = '22222222-2222-4222-8222-222222222222';
    const res = await route({
      name: 't',
      auth: 'public',
      params,
      handler: ({ params: p }) => respond.ok({ id: p.id }),
    })(post(), ctx({ id }));
    expect((await read(res)).body.data).toEqual({ id });
  });
});

describe('route — public', () => {
  it('creates no session client', async () => {
    const res = await route({
      name: 't',
      auth: 'public',
      handler: () => respond.ok('hi'),
    })(post(), ctx());
    expect(res.status).toBe(200);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
});

describe('route — cron', () => {
  const cron = route({
    name: 'cron/test',
    auth: 'cron',
    handler: () => respond.ok({ ran: true }),
  });

  it('500s with a ref when CRON_SECRET is unset', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const { status, body } = await read(
      await cron(post(undefined, { authorization: 'Bearer x' }), ctx())
    );
    expect(status).toBe(500);
    expect(body.error).toMatch(/^Internal error\. Ref: /);
    expect(spy).toHaveBeenCalledWith(
      'cron/test: CRON_SECRET not configured',
      expect.objectContaining({ ref: expect.any(String) })
    );
    spy.mockRestore();
  });

  it('401s on a missing header', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    const res = await cron(post(), ctx());
    expect(res.status).toBe(401);
  });

  it('401s on a wrong secret, including a different length', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    for (const header of [
      'Bearer nope',
      'Bearer s3cret-but-longer',
      's3cret',
    ]) {
      const res = await cron(post(undefined, { authorization: header }), ctx());
      expect(res.status).toBe(401);
    }
  });

  it('runs the handler with the right bearer', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    const res = await cron(
      post(undefined, { authorization: 'Bearer s3cret' }),
      ctx()
    );
    expect(await read(res)).toEqual({
      status: 200,
      body: { data: { ran: true }, error: null, status: 200 },
    });
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
});

describe('route — unhandled errors', () => {
  it('turns a throw into an enveloped 500 with a ref', async () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const res = await route({
      name: 'requests/x',
      auth: 'user',
      handler: () => {
        throw new Error('kaboom with internals');
      },
    })(post(), ctx());
    const { status, body } = await read(res);
    expect(status).toBe(500);
    expect(body.status).toBe(500);
    expect(body.error).toMatch(/^Internal error\. Ref: [0-9a-f-]{36}$/);
    expect(body.error).not.toContain('kaboom');
    expect(spy).toHaveBeenCalledWith(
      'requests/x: unhandled error',
      expect.objectContaining({ err: 'kaboom with internals' })
    );
    spy.mockRestore();
  });

  it('catches a throw from the auth step too', async () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    mocks.getUser.mockRejectedValue(new Error('network'));
    const res = await route({
      name: 't',
      auth: 'user',
      handler: () => respond.ok(null),
    })(post(), ctx());
    expect(res.status).toBe(500);
    spy.mockRestore();
  });
});
