// @vitest-environment node
// POST /api/ai/verify-signature: the diagnostic route's gate (a dedicated
// secret, constant-time, off when unset) and the buckets it will read.
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/ai/verify-signature/route';
import { logger } from '@/lib/logger';

const mocks = vi.hoisted(() => {
  const single = vi.fn();
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return {
    single,
    from,
    download: vi.fn(),
    verify: vi.fn(),
  };
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mocks.from }),
}));

vi.mock('@/lib/storage/object-url', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/storage/object-url')>();
  return { ...actual, downloadStorageObject: mocks.download };
});

vi.mock('@/lib/ai/signature/verifier', () => ({
  verifySignature: mocks.verify,
}));

const SECRET = 'd'.repeat(48);
const HOD_ID = '22222222-2222-4222-8222-222222222222';
const STORAGE = 'https://example.supabase.co/storage/v1/object/public';
const LETTER_URL = `${STORAGE}/weekend-letters/${HOD_ID}/letter.png`;
const REF_URL = `${STORAGE}/hod-signatures/${HOD_ID}/signature.png`;

const call = (
  body: unknown,
  headers: Record<string, string> = { 'x-internal-secret': SECRET }
) =>
  POST(
    new NextRequest('http://localhost/api/ai/verify-signature', {
      method: 'POST',
      body: JSON.stringify(body),
      headers,
    }),
    { params: Promise.resolve({}) }
  );

const valid = { hod_id: HOD_ID, submitted_signature_url: LETTER_URL };

beforeEach(() => {
  vi.stubEnv('SIGNATURE_DIAGNOSTIC_SECRET', SECRET);
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
  mocks.single.mockResolvedValue({ data: { signature_ref_url: REF_URL } });
  mocks.download.mockResolvedValue(Buffer.from('img'));
  mocks.verify.mockResolvedValue({ mismatch_ratio: 0.04, passed: true });
  vi.spyOn(logger, 'info').mockImplementation(() => undefined);
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('verify-signature — gate', () => {
  it('runs the comparison with the right secret', async () => {
    const res = await call(valid);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: { mismatch_ratio: 0.04, passed: true },
      error: null,
      status: 200,
    });
    expect(mocks.download).toHaveBeenCalledWith(expect.anything(), REF_URL);
    expect(mocks.download).toHaveBeenCalledWith(expect.anything(), LETTER_URL);
  });

  it('is off (403) when the secret is unset', async () => {
    vi.stubEnv('SIGNATURE_DIAGNOSTIC_SECRET', '');
    const res = await call(valid, { 'x-internal-secret': '' });
    expect(res.status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('is off (403) when the secret is too short to be safe', async () => {
    vi.stubEnv('SIGNATURE_DIAGNOSTIC_SECRET', 'short');
    const res = await call(valid, { 'x-internal-secret': 'short' });
    expect(res.status).toBe(403);
  });

  it('refuses a wrong secret', async () => {
    const res = await call(valid, { 'x-internal-secret': `${SECRET}x` });
    expect(res.status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('refuses a missing header', async () => {
    const res = await call(valid, {});
    expect(res.status).toBe(403);
  });

  it('no longer accepts the service-role key', async () => {
    const res = await call(valid, { 'x-internal-secret': 'service-role-key' });
    expect(res.status).toBe(403);
  });

  it('checks the secret before reading the body', async () => {
    const res = await call({ nope: true }, { 'x-internal-secret': 'wrong' });
    expect(res.status).toBe(403);
  });
});

describe('verify-signature — body', () => {
  it('accepts a hod-signatures object', async () => {
    const res = await call({ ...valid, submitted_signature_url: REF_URL });
    expect(res.status).toBe(200);
  });

  it.each([
    ['an arbitrary URL', 'https://attacker.example/sig.png'],
    ['a passport photo', `${STORAGE}/passport-photos/${HOD_ID}/photo.png`],
    ['an unknown bucket', `${STORAGE}/other/${HOD_ID}/sig.png`],
    ['a traversal path', `${STORAGE}/weekend-letters/../hod-signatures/x.png`],
    ['a non-URL', 'not a url'],
  ])('rejects %s with 422 and fetches nothing', async (_, url) => {
    const res = await call({ ...valid, submitted_signature_url: url });
    expect(res.status).toBe(422);
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('rejects a non-uuid hod_id', async () => {
    const res = await call({ ...valid, hod_id: 'abc' });
    expect(res.status).toBe(422);
  });

  it('422s when the Dean has no reference signature', async () => {
    mocks.single.mockResolvedValue({ data: { signature_ref_url: null } });
    const res = await call(valid);
    expect(res.status).toBe(422);
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('500s with a ref when a download fails', async () => {
    mocks.download.mockRejectedValue(new Error('boom'));
    const res = await call(valid);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/^Internal error\. Ref: /);
    expect(body.error).not.toContain('boom');
  });
});
