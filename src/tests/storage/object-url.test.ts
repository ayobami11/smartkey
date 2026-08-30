import { describe, expect, it } from 'vitest';

import {
  isValidObjectPath,
  parseStorageUrl,
  rewriteStorageUrls,
  toProxyUrl,
} from '@/lib/storage/object-url';

const ID = '11111111-2222-3333-4444-555555555555';
const BASE = 'https://abc.supabase.co/storage/v1/object';

describe('parseStorageUrl', () => {
  it('parses a public object URL', () => {
    expect(
      parseStorageUrl(`${BASE}/public/hod-signatures/${ID}/signature.png`)
    ).toEqual({ bucket: 'hod-signatures', path: `${ID}/signature.png` });
  });

  it('parses a signed object URL, ignoring the token query string', () => {
    expect(
      parseStorageUrl(
        `${BASE}/sign/weekend-letters/${ID}/letter.pdf?token=abc.def`
      )
    ).toEqual({ bucket: 'weekend-letters', path: `${ID}/letter.pdf` });
  });

  it('parses an authenticated object URL', () => {
    expect(
      parseStorageUrl(
        `${BASE}/authenticated/passport-photos/${ID}/passport.jpg`
      )
    ).toEqual({ bucket: 'passport-photos', path: `${ID}/passport.jpg` });
  });

  it('returns null for a bucket outside the proxied set', () => {
    expect(
      parseStorageUrl(`${BASE}/public/other-bucket/${ID}/x.png`)
    ).toBeNull();
  });

  it('returns null for a non-storage URL', () => {
    expect(parseStorageUrl('https://example.com/photo.png')).toBeNull();
  });

  it('returns null for a malformed URL', () => {
    expect(parseStorageUrl('not a url')).toBeNull();
  });

  it('returns null for null and empty input', () => {
    expect(parseStorageUrl(null)).toBeNull();
    expect(parseStorageUrl('')).toBeNull();
  });

  it('rejects a traversal attempt in the object path', () => {
    expect(
      parseStorageUrl(
        `${BASE}/public/hod-signatures/${ID}/..%2F..%2Fsecret.png`
      )
    ).toBeNull();
  });

  it('rejects a nested path with more than one folder segment', () => {
    expect(
      parseStorageUrl(`${BASE}/public/hod-signatures/${ID}/nested/sig.png`)
    ).toBeNull();
  });
});

describe('isValidObjectPath', () => {
  it('accepts the {uuid}/{filename} shape', () => {
    expect(isValidObjectPath(`${ID}/signature.png`)).toBe(true);
  });

  it.each([
    ['traversal', `${ID}/../other.png`],
    ['nested folders', `${ID}/a/b.png`],
    ['no folder segment', 'signature.png'],
    ['non-uuid folder', `abc/signature.png`],
    ['empty', ''],
  ])('rejects %s', (_label, path) => {
    expect(isValidObjectPath(path)).toBe(false);
  });
});

describe('toProxyUrl', () => {
  it('rewrites to the proxy route with bucket and path params', () => {
    expect(
      toProxyUrl(`${BASE}/public/hod-signatures/${ID}/signature.png`)
    ).toBe(
      `/api/storage/object?bucket=hod-signatures&path=${ID}%2Fsignature.png`
    );
  });

  it('appends a version param when given one', () => {
    const url = toProxyUrl(
      `${BASE}/public/passport-photos/${ID}/passport.jpg`,
      {
        version: 1234,
      }
    );
    expect(url).toContain('v=1234');
  });

  it('returns null for an unrecognised URL so callers keep their empty state', () => {
    expect(toProxyUrl('https://example.com/x.png')).toBeNull();
    expect(toProxyUrl(null)).toBeNull();
  });
});

describe('rewriteStorageUrls', () => {
  it('rewrites storage URLs nested inside a payload', () => {
    const payload = {
      requests: [
        {
          id: 'r1',
          requester: {
            full_name: 'Dr. Bakare',
            photo_url: `${BASE}/public/passport-photos/${ID}/passport.jpg`,
          },
        },
      ],
    };

    const result = rewriteStorageUrls(payload);

    expect(result.requests[0].requester.photo_url).toBe(
      `/api/storage/object?bucket=passport-photos&path=${ID}%2Fpassport.jpg`
    );
  });

  it('leaves non-storage strings, numbers, nulls and booleans untouched', () => {
    const payload = {
      full_name: 'Dr. Bakare',
      count: 3,
      photo_url: null,
      overdue: true,
      link: 'https://example.com/help',
    };

    expect(rewriteStorageUrls(payload)).toEqual(payload);
  });

  it('preserves array shape', () => {
    const payload = [
      { photo_url: `${BASE}/public/passport-photos/${ID}/passport.jpg` },
      { photo_url: null },
    ];

    const result = rewriteStorageUrls(payload);

    expect(result).toHaveLength(2);
    expect(result[0].photo_url).toMatch(/^\/api\/storage\/object\?/);
    expect(result[1].photo_url).toBeNull();
  });

  it('does not mutate the input payload', () => {
    const original = `${BASE}/public/passport-photos/${ID}/passport.jpg`;
    const payload = { photo_url: original };

    rewriteStorageUrls(payload);

    expect(payload.photo_url).toBe(original);
  });
});
