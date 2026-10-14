// @vitest-environment node
// GET /api/storage/object: the headers it serves each kind of stored object
// with. The content type comes from the object's bytes, never from the type
// stored alongside it, so an SVG or HTML file already in a bucket (stored
// under whatever type its uploader declared) is never served inline.
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/storage/object/route';
import { logger } from '@/lib/logger';
import { OBJECT_CSP } from '@/lib/storage/object-headers';

import { fake, imageBytes, resetFake, USER_ID } from '../http/contract-harness';

vi.mock('@/lib/supabase/server', async () => {
  const h = await import('../http/contract-harness');
  return { createServerClient: async () => h.makeClient('server') };
});
vi.mock('@/lib/supabase/admin', async () => {
  const h = await import('../http/contract-harness');
  return { createAdminClient: () => h.makeClient('admin') };
});

const request = (bucket = 'passport-photos', file = 'passport.png') =>
  new NextRequest(
    `http://localhost/api/storage/object?bucket=${bucket}&path=${USER_ID}%2F${file}`
  );

// A stored object: its bytes, and the content type Storage holds for it (the
// one the uploader declared, which the route must ignore).
const stored = (bytes: BlobPart, declaredType: string) => {
  fake.storage.download = {
    data: new Blob([bytes], { type: declaredType }),
    error: null,
  };
};

const serve = async (bucket?: string, file?: string) => {
  const res = await GET(request(bucket, file));
  return { res, headers: Object.fromEntries(res.headers.entries()) };
};

const PDF = new TextEncoder().encode('%PDF-1.7\n');
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
]);
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.cookie)</script></svg>';
const HTML = '<!doctype html><script>alert(document.cookie)</script>';

beforeEach(() => {
  resetFake();
  // The owner reading their own photo.
  fake.profile = {
    role: 'REQUESTER',
    unit_id: null,
    full_name: 'Ada',
    status: 'ACTIVE',
  } as typeof fake.profile;
  vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
});

describe('GET /api/storage/object — headers', () => {
  it.each([
    ['PNG', imageBytes(32, 'png'), 'image/png'],
    ['JPEG', imageBytes(32, 'jpeg'), 'image/jpeg'],
    ['WebP', WEBP, 'image/webp'],
  ])(
    'serves a %s inline as itself, with the CSP',
    async (_label, bytes, type) => {
      stored(bytes, type);
      const { res, headers } = await serve();
      expect(res.status).toBe(200);
      expect(headers).toMatchObject({
        'content-type': type,
        'content-disposition': 'inline',
        'content-security-policy': OBJECT_CSP,
        'x-content-type-options': 'nosniff',
        'cache-control': 'private, max-age=300, must-revalidate',
      });
    }
  );

  it('serves a PNG stored as text/html as image/png', async () => {
    stored(imageBytes(32), 'text/html');
    const { headers } = await serve();
    expect(headers['content-type']).toBe('image/png');
    expect(headers['content-disposition']).toBe('inline');
  });

  it('serves a JPEG stored as image/png as image/jpeg', async () => {
    stored(imageBytes(32, 'jpeg'), 'image/png');
    expect((await serve()).headers['content-type']).toBe('image/jpeg');
  });

  it.each([
    ['an SVG stored as image/svg+xml', SVG, 'image/svg+xml'],
    ['an SVG stored as image/png', SVG, 'image/png'],
    ['HTML stored as text/html', HTML, 'text/html'],
    ['HTML stored as image/jpeg', HTML, 'image/jpeg'],
    ['an empty object', '', 'image/png'],
  ])(
    'serves %s as an octet-stream attachment',
    async (_label, bytes, declared) => {
      stored(bytes, declared);
      const { res, headers } = await serve();
      expect(res.status).toBe(200);
      expect(headers).toMatchObject({
        'content-type': 'application/octet-stream',
        'content-disposition': 'attachment',
        'content-security-policy': OBJECT_CSP,
        'x-content-type-options': 'nosniff',
      });
    }
  );

  it('serves a PDF as an application/pdf attachment, never inline', async () => {
    fake.profile = {
      role: 'CSO',
      unit_id: null,
      full_name: 'CSO',
      status: 'ACTIVE',
    } as typeof fake.profile;
    stored(PDF, 'application/pdf');
    const { headers } = await serve('weekend-letters', 'letter.pdf');
    expect(headers).toMatchObject({
      'content-type': 'application/pdf',
      'content-disposition': 'attachment',
      'content-security-policy': OBJECT_CSP,
    });
  });

  it('streams the whole object, not just the sniffed head', async () => {
    const bytes = imageBytes(4096);
    stored(bytes, 'image/png');
    const { res } = await serve();
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
  });

  it('the CSP disables script and sandboxes the document', () => {
    expect(OBJECT_CSP).toContain("default-src 'none'");
    expect(OBJECT_CSP).toMatch(/(^|; )sandbox($|;)/);
    expect(OBJECT_CSP).not.toContain('script-src');
  });
});

describe('GET /api/storage/object — session', () => {
  it('401s a deactivated user whose session is still valid', async () => {
    fake.profile = {
      role: 'CSO',
      unit_id: null,
      full_name: 'CSO',
      status: 'DEACTIVATED',
    } as typeof fake.profile;
    stored(imageBytes(32), 'image/png');
    const { res } = await serve();
    expect(res.status).toBe(401);
    expect(fake.storageCalls).toHaveLength(0);
  });

  it('still serves a user who is pending activation', async () => {
    fake.profile = {
      role: 'REQUESTER',
      unit_id: null,
      full_name: 'Ada',
      status: 'PENDING_ACTIVATION',
    } as typeof fake.profile;
    stored(imageBytes(32), 'image/png');
    expect((await serve()).res.status).toBe(200);
  });
});
