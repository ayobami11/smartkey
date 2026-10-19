// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  GUEST_SUBMISSION_LIMITS,
  checkGuestSubmission,
  clientIp,
  describeWait,
  hashRateLimitKey,
  normaliseIp,
} from '@/lib/http/rate-limit';
import { logger } from '@/lib/logger';
import type { RpcClient } from '@/lib/rpc/call-rpc';

type RpcAnswer = { data: unknown; error: { message: string } | null };

const fakeAdmin = (answers: RpcAnswer[]) => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return answers.shift() ?? { data: 0, error: null };
    },
  } as unknown as RpcClient;
  return { client, calls };
};

const SALT = 'test-salt-0123456789abcdef';

beforeEach(() => {
  vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('normaliseIp', () => {
  it.each([
    ['203.0.113.7', '203.0.113.7'],
    [' 203.0.113.7 ', '203.0.113.7'],
    ['::ffff:203.0.113.7', '203.0.113.7'],
    ['2001:db8:1:2:3:4:5:6', '2001:db8:1:2::/64'],
    ['2001:0db8:0001:0002::9', '2001:db8:1:2::/64'],
    ['2001:db8::1', '2001:db8:0:0::/64'],
    ['[2001:db8:1:2::9]', '2001:db8:1:2::/64'],
    ['fe80::1%eth0', 'fe80:0:0:0::/64'],
  ])('%s → %s', (raw, expected) => {
    expect(normaliseIp(raw)).toBe(expected);
  });

  it('counts every address in one IPv6 /64 as the same client', () => {
    expect(normaliseIp('2001:db8:1:2::1')).toBe(
      normaliseIp('2001:db8:1:2:ffff:ffff:ffff:ffff')
    );
  });

  it.each(['', 'unknown', '999.1.1.1', 'not-an-ip'])(
    'returns null for %j',
    (raw) => {
      expect(normaliseIp(raw)).toBeNull();
    }
  );
});

describe('clientIp', () => {
  it('takes the first x-forwarded-for entry', () => {
    const headers = new Headers({
      'x-forwarded-for': '203.0.113.7, 10.0.0.1, 10.0.0.2',
    });
    expect(clientIp(headers)).toBe('203.0.113.7');
  });

  it('falls back to x-real-ip', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.4' }))).toBe(
      '198.51.100.4'
    );
  });

  it('is null with no usable header', () => {
    expect(clientIp(new Headers())).toBeNull();
    expect(clientIp(new Headers({ 'x-forwarded-for': 'garbage' }))).toBeNull();
  });
});

describe('hashRateLimitKey', () => {
  it('is a 64-character hex digest that does not contain the input', () => {
    const hash = hashRateLimitKey('203.0.113.7', SALT);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('203');
  });

  it('depends on the salt', () => {
    expect(hashRateLimitKey('203.0.113.7', SALT)).not.toBe(
      hashRateLimitKey('203.0.113.7', 'another-salt')
    );
  });
});

describe('describeWait', () => {
  it.each([
    [1, 'about a minute'],
    [60, 'about a minute'],
    [61, 'about 2 minutes'],
    [2400, 'about 40 minutes'],
    [3600, 'about 60 minutes'],
    [5340, 'about 89 minutes'],
    [5400, 'about 2 hours'],
    [18_000, 'about 5 hours'],
  ])('%i seconds → %s', (seconds, expected) => {
    expect(describeWait(seconds)).toBe(expected);
  });
});

describe('checkGuestSubmission', () => {
  const headers = new Headers({ 'x-forwarded-for': '203.0.113.7' });

  it('fails open with a warning when RATE_LIMIT_SALT is unset', async () => {
    vi.stubEnv('RATE_LIMIT_SALT', '');
    const { client, calls } = fakeAdmin([]);

    const decision = await checkGuestSubmission(client, {
      headers,
      email: 'jane@example.com',
    });

    expect(decision).toEqual({ allowed: true });
    expect(calls).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('RATE_LIMIT_SALT is not set')
    );
  });

  it('checks the address, then the email, with hashed keys', async () => {
    vi.stubEnv('RATE_LIMIT_SALT', SALT);
    const { client, calls } = fakeAdmin([
      { data: 0, error: null },
      { data: 0, error: null },
    ]);

    const decision = await checkGuestSubmission(client, {
      headers,
      email: '  Jane@Example.com ',
    });

    expect(decision).toEqual({ allowed: true });
    expect(calls).toEqual([
      {
        name: 'check_rate_limit',
        args: {
          p_bucket: 'guest-submit:ip',
          p_key: hashRateLimitKey('203.0.113.7', SALT),
          p_limit: GUEST_SUBMISSION_LIMITS.perIp.limit,
          p_window: '3600 seconds',
        },
      },
      {
        name: 'check_rate_limit',
        args: {
          p_bucket: 'guest-submit:email',
          p_key: hashRateLimitKey('jane@example.com', SALT),
          p_limit: GUEST_SUBMISSION_LIMITS.perEmail.limit,
          p_window: '86400 seconds',
        },
      },
    ]);
  });

  it('stops at the address limit without checking the email', async () => {
    vi.stubEnv('RATE_LIMIT_SALT', SALT);
    const { client, calls } = fakeAdmin([{ data: 1200, error: null }]);

    const decision = await checkGuestSubmission(client, {
      headers,
      email: 'jane@example.com',
    });

    expect(decision).toEqual({ allowed: false, retryAfterSeconds: 1200 });
    expect(calls).toHaveLength(1);
  });

  it('refuses on the email limit', async () => {
    vi.stubEnv('RATE_LIMIT_SALT', SALT);
    const { client } = fakeAdmin([
      { data: 0, error: null },
      { data: 43_200, error: null },
    ]);

    expect(
      await checkGuestSubmission(client, { headers, email: 'jane@example.com' })
    ).toEqual({ allowed: false, retryAfterSeconds: 43_200 });
  });

  it('checks only the email when there is no client address', async () => {
    vi.stubEnv('RATE_LIMIT_SALT', SALT);
    const { client, calls } = fakeAdmin([]);

    await checkGuestSubmission(client, {
      headers: new Headers(),
      email: 'jane@example.com',
    });

    expect(calls.map((c) => c.args.p_bucket)).toEqual(['guest-submit:email']);
  });

  it('fails open, logging an error, when the RPC fails', async () => {
    vi.stubEnv('RATE_LIMIT_SALT', SALT);
    const { client } = fakeAdmin([
      { data: null, error: { message: 'function does not exist' } },
      { data: null, error: { message: 'function does not exist' } },
    ]);

    expect(
      await checkGuestSubmission(client, { headers, email: 'jane@example.com' })
    ).toEqual({ allowed: true });
    expect(logger.error).toHaveBeenCalledWith(
      'rate-limit: check failed, allowing the request',
      expect.objectContaining({ bucket: 'guest-submit:ip' })
    );
  });
});
