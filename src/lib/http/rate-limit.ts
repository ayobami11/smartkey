/**
 * Postgres-backed rate limiting for session-less routes.
 *
 * Vercel runs each route as serverless functions with no shared memory, so
 * the count lives in `public.rate_limit_hits` and is kept by the
 * `check_rate_limit` RPC (`20261019100000_guest_rate_limit.sql`), which
 * counts and records a hit atomically. This module chooses the keys and
 * turns the RPC's answer into a decision.
 *
 * Keys are never stored raw: an IP address or email is hashed with
 * HMAC-SHA-256 under `RATE_LIMIT_SALT` before it leaves the server, and the
 * table's CHECK only accepts a 64-character hex digest.
 *
 * It fails open. With no salt, or when the RPC errors (including before the
 * migration is applied), the limit is skipped and a warning or error is
 * logged. Failing closed would turn a configuration mistake into "no guest
 * can submit a weekend request", and this limit is abuse protection, not an
 * access control: every submission still needs a Dean's or the CSO's
 * approval before a key is handed over.
 */

import { createHmac } from 'node:crypto';
import { isIPv4, isIPv6 } from 'node:net';

import { logger } from '@/lib/logger';
import { callRpc, type RpcClient } from '@/lib/rpc/call-rpc';

export type RateLimitRule = {
  /** Namespaces the count, so one key can have several limits. */
  bucket: string;
  limit: number;
  windowSeconds: number;
};

const HOUR = 60 * 60;

/**
 * POST /api/public/weekend-request. A genuine guest submits once per
 * weekend; a few retries (a wrong date, a re-scanned letter) fit well inside
 * these. Both are checked, so rotating emails from one address, or one email
 * from several addresses, each hits a limit.
 */
export const GUEST_SUBMISSION_LIMITS = {
  perIp: { bucket: 'guest-submit:ip', limit: 5, windowSeconds: HOUR },
  perEmail: {
    bucket: 'guest-submit:email',
    limit: 3,
    windowSeconds: 24 * HOUR,
  },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

const ALLOWED: RateLimitDecision = { allowed: true };

/** Expands an IPv6 address to its eight hextets, without leading zeros. */
const ipv6Groups = (address: string): string[] => {
  const [head, tail] = address.split('::');
  const headGroups = head ? head.split(':') : [];
  if (tail === undefined) return headGroups;
  const tailGroups = tail ? tail.split(':') : [];
  const missing = 8 - headGroups.length - tailGroups.length;
  return [
    ...headGroups,
    ...Array<string>(Math.max(0, missing)).fill('0'),
    ...tailGroups,
  ].map((group) =>
    group.includes('.') ? group : parseInt(group, 16).toString(16)
  );
};

/**
 * The value to count an address under. IPv4 as-is; an IPv4-mapped IPv6
 * address as its IPv4; any other IPv6 address as its /64, because one
 * subscriber is usually handed a whole /64 and could otherwise rotate
 * through it. Anything that is not an IP address is `null`.
 */
export const normaliseIp = (raw: string): string | null => {
  const address = raw
    .trim()
    .replace(/^\[|\]$/g, '')
    .split('%')[0];
  if (isIPv4(address)) return address;
  if (!isIPv6(address)) return null;

  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  if (mapped && isIPv4(mapped[1])) return mapped[1];

  return `${ipv6Groups(address.toLowerCase()).slice(0, 4).join(':')}::/64`;
};

/**
 * The client's address. On Vercel the platform sets `x-forwarded-for` and
 * its first entry is the client; a value the client sent is not passed
 * through. `x-real-ip` is the fallback. `null` when neither holds an IP.
 */
export const clientIp = (headers: Headers): string | null => {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0];
  const candidate = forwarded?.trim() || headers.get('x-real-ip')?.trim();
  return candidate ? normaliseIp(candidate) : null;
};

/** HMAC-SHA-256 of `value`, hex. What `rate_limit_hits.key_hash` stores. */
export const hashRateLimitKey = (value: string, salt: string): string =>
  createHmac('sha256', salt).update(value).digest('hex');

/** One rule, one key. Fails open on an RPC error (logged by callRpc). */
export const checkRateLimit = async (
  admin: RpcClient,
  rule: RateLimitRule,
  keyHash: string
): Promise<RateLimitDecision> => {
  const result = await callRpc(admin, 'check_rate_limit', {
    p_bucket: rule.bucket,
    p_key: keyHash,
    p_limit: rule.limit,
    p_window: `${rule.windowSeconds} seconds`,
  });
  if (!result.ok) {
    logger.error('rate-limit: check failed, allowing the request', {
      bucket: rule.bucket,
      kind: result.error.kind,
      ref: result.error.ref,
    });
    return ALLOWED;
  }
  const retryAfter = Number(result.data);
  return retryAfter > 0
    ? { allowed: false, retryAfterSeconds: Math.ceil(retryAfter) }
    : ALLOWED;
};

/**
 * Checks a guest submission against both limits: the client address first,
 * then the email. A hit is recorded under the address even when the email
 * limit then refuses, which only errs towards stricter.
 */
export const checkGuestSubmission = async (
  admin: RpcClient,
  { headers, email }: { headers: Headers; email: string }
): Promise<RateLimitDecision> => {
  const salt = process.env.RATE_LIMIT_SALT?.trim();
  if (!salt) {
    logger.warn(
      'rate-limit: RATE_LIMIT_SALT is not set; guest submissions are not rate limited'
    );
    return ALLOWED;
  }

  const ip = clientIp(headers);
  if (ip) {
    const byIp = await checkRateLimit(
      admin,
      GUEST_SUBMISSION_LIMITS.perIp,
      hashRateLimitKey(ip, salt)
    );
    if (!byIp.allowed) return byIp;
  } else {
    logger.warn('rate-limit: no client address; skipping the per-IP limit');
  }

  return checkRateLimit(
    admin,
    GUEST_SUBMISSION_LIMITS.perEmail,
    hashRateLimitKey(email.trim().toLowerCase(), salt)
  );
};

/** "about 40 minutes", "about 5 hours": the wait, rounded up, for copy. */
export const describeWait = (seconds: number): string => {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes < 90) {
    return minutes === 1 ? 'about a minute' : `about ${minutes} minutes`;
  }
  const hours = Math.ceil(minutes / 60);
  return `about ${hours} hours`;
};
