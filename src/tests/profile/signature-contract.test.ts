// @vitest-environment node
// Contract for POST /api/profile/signature (Dean signature/stamp reference
// replacement). The route was already moved onto route() in PR #64; batch 6
// leaves its logic alone, and these tests pin it so the batch cannot drift it:
// auth, multipart validation, the plausibility gate, the verify → hold / set
// split, the RPC error kinds it maps, and that only proxy URLs leave it.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as postSignature } from '@/app/api/profile/signature/route';
import { logger } from '@/lib/logger';

import {
  call,
  describeAuth,
  expectRef,
  failure,
  fake,
  asRole,
  imageBytes,
  multipart,
  publicUrl,
  resetFake,
  rpcError,
  send,
  USER_ID,
} from '../http/contract-harness';

const verifier = vi.hoisted(() => ({
  assessPlausibility: vi.fn(),
  verifySignature: vi.fn(),
}));

vi.mock('@/lib/supabase/server', async () => {
  const h = await import('../http/contract-harness');
  return { createServerClient: async () => h.makeClient('server') };
});
vi.mock('@/lib/supabase/admin', async () => {
  const h = await import('../http/contract-harness');
  return { createAdminClient: () => h.makeClient('admin') };
});
vi.mock('@/lib/ai/signature/verifier', () => ({
  DEFAULT_THRESHOLD: 0.55,
  assessPlausibility: verifier.assessPlausibility,
  verifySignature: verifier.verifySignature,
}));

const path = '/api/profile/signature';
const CURRENT_REF = publicUrl('hod-signatures', `${USER_ID}/signature-old.png`);
const DB_TEXT = 'storage internal failure text';

// CHANGED: the bytes start with a PNG signature. The route now detects the
// stored type from the bytes, and all-zero bytes are rejected as not an image.
const image = (name = 'sig.png', size = 16) =>
  new File([imageBytes(size)], name, { type: 'image/png' });

const upload = (fields: Record<string, string | File>) =>
  multipart('POST', path, fields);

const validUpload = () => upload({ type: 'signature', image: image() });

const uploadedPath = () =>
  fake.storageCalls.find((c) => c.method === 'upload')?.args[0] as string;

const UPLOAD_PATH = new RegExp(`^${USER_ID}/signature-[0-9a-f-]{36}\\.png$`);
const PROXY_URL = new RegExp(
  `^/api/storage/object\\?bucket=hod-signatures&path=${USER_ID}%2Fsignature-[0-9a-f-]{36}\\.png&v=\\d+$`
);

beforeEach(() => {
  resetFake();
  asRole('DEAN');
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
  verifier.assessPlausibility.mockReset();
  verifier.assessPlausibility.mockResolvedValue({ plausible: true });
  verifier.verifySignature.mockReset();
  verifier.verifySignature.mockResolvedValue({
    mismatch_ratio: 0.1,
    passed: true,
  });
  fake.tables.profiles = {
    data: { signature_ref_url: CURRENT_REF, stamp_ref_url: null },
    error: null,
  };
  fake.rpc.set_signature_reference = { data: [{ ok: true }], error: null };
  fake.rpc.hold_signature_reference = { data: [{ ok: true }], error: null };
});

describeAuth('profile/signature', postSignature, validUpload, ['DEAN']);

describe('POST /api/profile/signature validation', () => {
  it('401 Unauthorized when the reference lookup finds no row', async () => {
    fake.tables.profiles = { data: null, error: null };
    expect(await call(postSignature, validUpload())).toEqual(
      failure(401, 'Unauthorized')
    );
  });

  it('422 Invalid form data for a non-multipart body', async () => {
    expect(
      await call(postSignature, send('POST', path, { type: 'signature' }))
    ).toEqual(failure(422, 'Invalid form data'));
  });

  for (const type of [undefined, 'letter']) {
    it(`422 for type ${String(type)}`, async () => {
      const fields: Record<string, string | File> = { image: image() };
      if (type) fields.type = type;
      expect(await call(postSignature, upload(fields))).toEqual(
        failure(422, 'type must be "signature" or "stamp"')
      );
    });
  }

  it('422 image is required with no file', async () => {
    expect(await call(postSignature, upload({ type: 'stamp' }))).toEqual(
      failure(422, 'image is required')
    );
  });

  it('413 Image must be under 5 MB', async () => {
    const big = image('big.png', 5 * 1024 * 1024 + 1);
    expect(
      await call(postSignature, upload({ type: 'signature', image: big }))
    ).toEqual(failure(413, 'Image must be under 5 MB'));
    expect(fake.storageCalls).toHaveLength(0);
  });

  it('422 for a blank image', async () => {
    verifier.assessPlausibility.mockResolvedValue({
      plausible: false,
      reason: 'too_sparse',
    });
    const res = await call(postSignature, validUpload());
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/appears blank/);
    expect(fake.storageCalls).toHaveLength(0);
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it('422 for an image with too much dark content', async () => {
    verifier.assessPlausibility.mockResolvedValue({
      plausible: false,
      reason: 'too_dense',
    });
    const res = await call(postSignature, validUpload());
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/too much dark content/);
  });
});

describe('POST /api/profile/signature upload type', () => {
  const svg = () =>
    new File(
      ['<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'],
      'sig.svg',
      {
        type: 'image/svg+xml',
      }
    );

  it('422 for an SVG, before anything is stored or compared', async () => {
    const res = await call(
      postSignature,
      upload({ type: 'signature', image: svg() })
    );
    expect(res).toEqual(failure(422, 'image must be a PNG, JPEG or WebP file'));
    expect(verifier.assessPlausibility).not.toHaveBeenCalled();
    expect(fake.storageCalls).toHaveLength(0);
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it('422 for a PDF', async () => {
    const pdf = new File(['%PDF-1.7\n'], 'sig.png', { type: 'image/png' });
    expect(
      await call(postSignature, upload({ type: 'signature', image: pdf }))
    ).toEqual(failure(422, 'image must be a PNG, JPEG or WebP file'));
  });

  it('stores a PNG labelled text/html as image/png with a .png path', async () => {
    const lying = new File([imageBytes()], 'sig.html', { type: 'text/html' });
    const res = await call(
      postSignature,
      upload({ type: 'signature', image: lying })
    );
    expect(res.status).toBe(200);
    const uploadCall = fake.storageCalls.find((c) => c.method === 'upload');
    expect(uploadCall?.args[0]).toMatch(UPLOAD_PATH);
    expect(uploadCall?.args[2]).toEqual({ contentType: 'image/png' });
  });

  it('names the object after the detected type, not the filename', async () => {
    const jpeg = new File([imageBytes(16, 'jpeg')], 'sig.png', {
      type: 'image/png',
    });
    await call(postSignature, upload({ type: 'signature', image: jpeg }));
    const uploadCall = fake.storageCalls.find((c) => c.method === 'upload');
    expect(uploadCall?.args[0]).toMatch(
      new RegExp(`^${USER_ID}/signature-[0-9a-f-]{36}\\.jpg$`)
    );
    expect(uploadCall?.args[2]).toEqual({ contentType: 'image/jpeg' });
  });
});

describe('POST /api/profile/signature outcomes', () => {
  it('sets the reference when verification passes', async () => {
    const res = await call(postSignature, validUpload());
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('updated');
    expect(res.body.data.new_url).toMatch(PROXY_URL);

    expect(uploadedPath()).toMatch(UPLOAD_PATH);
    const uploadCall = fake.storageCalls.find((c) => c.method === 'upload');
    expect(uploadCall).toMatchObject({
      client: 'admin',
      bucket: 'hod-signatures',
    });
    expect(uploadCall?.args[2]).toEqual({ contentType: 'image/png' });

    expect(fake.rpcCalls).toEqual([
      {
        name: 'set_signature_reference',
        args: {
          p_profile_id: USER_ID,
          p_type: 'signature',
          p_new_url: publicUrl('hod-signatures', uploadedPath()),
          p_compared_ref_url: CURRENT_REF,
        },
      },
    ]);
  });

  it('sets the reference without comparing when none is on file', async () => {
    const res = await call(
      postSignature,
      upload({ type: 'stamp', image: image('stamp.png') })
    );
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('updated');
    expect(verifier.verifySignature).not.toHaveBeenCalled();
    expect(fake.rpcCalls[0]).toMatchObject({
      name: 'set_signature_reference',
      args: { p_type: 'stamp', p_compared_ref_url: undefined },
    });
  });

  it('holds the upload for the CSO when verification fails', async () => {
    verifier.verifySignature.mockResolvedValue({
      mismatch_ratio: 0.7123,
      passed: false,
    });
    const res = await call(postSignature, validUpload());
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      status: 'HELD_SIGNATURE_MISMATCH',
      mismatch_pct: 71.23,
      message: expect.stringMatching(/CSO has been notified/),
    });
    expect(fake.rpcCalls).toEqual([
      {
        name: 'hold_signature_reference',
        args: {
          p_profile_id: USER_ID,
          p_type: 'signature',
          p_pending_url: publicUrl('hod-signatures', uploadedPath()),
          p_compared_ref_url: CURRENT_REF,
          p_mismatch_pct: 71.23,
          p_threshold_pct: 55,
        },
      },
    ]);
  });

  it('500 with a ref when the current reference cannot be downloaded', async () => {
    fake.storage.download = { data: null, error: { message: DB_TEXT } };
    const res = await call(postSignature, validUpload());
    expectRef(res);
    expect(JSON.stringify(res.body)).not.toContain(DB_TEXT);
  });

  it('500 with a ref when verification throws', async () => {
    verifier.verifySignature.mockRejectedValue(new Error(DB_TEXT));
    const res = await call(postSignature, validUpload());
    expectRef(res);
    expect(JSON.stringify(res.body)).not.toContain(DB_TEXT);
  });

  it('500 with a ref when the upload fails', async () => {
    fake.storage.upload = { data: null, error: { message: DB_TEXT } };
    const res = await call(postSignature, validUpload());
    expectRef(res);
    expect(JSON.stringify(res.body)).not.toContain(DB_TEXT);
    expect(fake.rpcCalls).toHaveLength(0);
  });

  const REFERENCE_CHANGED =
    'Your reference changed while this upload was being checked. Please try again.';

  for (const [rpc, failVerify] of [
    ['set_signature_reference', false],
    ['hold_signature_reference', true],
  ] as const) {
    describe(`${rpc} errors`, () => {
      beforeEach(() => {
        if (failVerify) {
          verifier.verifySignature.mockResolvedValue({
            mismatch_ratio: 0.9,
            passed: false,
          });
        }
      });

      const cases: [string, number, string][] = [
        ['CONFLICT: reference changed', 409, REFERENCE_CHANGED],
        ['NOT_FOUND: no such profile', 404, 'Not found'],
        ['FORBIDDEN: not a dean', 403, 'Forbidden'],
        ['VALIDATION: bad type', 422, 'Invalid request'],
      ];
      for (const [raised, status, message] of cases) {
        it(`${raised} → ${status}, and the upload is removed`, async () => {
          fake.rpc[rpc] = rpcError(raised);
          expect(await call(postSignature, validUpload())).toEqual(
            failure(status, message)
          );
          const remove = fake.storageCalls.find((c) => c.method === 'remove');
          expect(remove?.args[0]).toEqual([uploadedPath()]);
        });
      }

      it('an unrecognised error → 500 with a ref', async () => {
        fake.rpc[rpc] = rpcError(`some postgres failure ${DB_TEXT}`);
        const res = await call(postSignature, validUpload());
        expectRef(res);
        expect(JSON.stringify(res.body)).not.toContain(DB_TEXT);
      });
    });
  }

  it('a throw becomes an enveloped 500 with a ref', async () => {
    fake.tables.profiles = () => {
      throw new Error('boom');
    };
    expectRef(await call(postSignature, validUpload()));
  });
});
