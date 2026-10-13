// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { respond } from '@/lib/http/respond';
import { logger } from '@/lib/logger';

describe('respond', () => {
  it('ok: envelope status equals HTTP status (default 200)', async () => {
    const res = respond.ok({ a: 1 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: { a: 1 },
      error: null,
      status: 200,
    });
  });

  it('ok: carries a 201 into the envelope too', async () => {
    const res = respond.ok({ id: 'x' }, 201);
    expect(res.status).toBe(201);
    expect((await res.json()).status).toBe(201);
  });

  it('fail: builds the error envelope', async () => {
    const res = respond.fail(409, 'Conflict');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      data: null,
      error: 'Conflict',
      status: 409,
    });
  });

  it('error: takes an HttpError', async () => {
    const res = respond.error({ status: 422, message: 'Bad' });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ data: null, error: 'Bad', status: 422 });
  });

  it('internal: logs context under a ref and exposes only the ref', async () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const res = respond.internal('thing failed', { err: 'db exploded' });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.status).toBe(500);
    expect(body.error).toMatch(/^Internal error\. Ref: [0-9a-f-]{36}$/);
    expect(body.error).not.toContain('db exploded');
    const ref = body.error.replace('Internal error. Ref: ', '');
    expect(spy).toHaveBeenCalledWith('thing failed', {
      err: 'db exploded',
      ref,
    });
    spy.mockRestore();
  });

  it('noContent: 204 with an empty body', async () => {
    const res = respond.noContent();
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
  });
});
