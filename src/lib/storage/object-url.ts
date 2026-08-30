import type { SupabaseClient } from '@supabase/supabase-js';

export const PROXIED_BUCKETS = [
  'passport-photos',
  'hod-signatures',
  'weekend-letters',
] as const;

export type ProxiedBucket = (typeof PROXIED_BUCKETS)[number];

export type StorageObjectRef = {
  bucket: ProxiedBucket;
  path: string;
};

const isProxiedBucket = (value: string): value is ProxiedBucket =>
  (PROXIED_BUCKETS as readonly string[]).includes(value);

// Object paths are always exactly two segments: one folder, one flat filename.
// The folder is usually a profile id (`{profileId}/signature.png`), but guest
// weekend letters upload to a literal `guest/{uuid}.{ext}` folder, so this
// cannot require a UUID. Nested folders, traversal and absolute paths are
// rejected rather than normalised; a folder that is not a real profile id
// simply never matches an owner, leaving only the route's role checks.
const OBJECT_PATH_PATTERN =
  /^[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;

export const isValidObjectPath = (path: string): boolean =>
  OBJECT_PATH_PATTERN.test(path) && !path.includes('..');

// Storage URLs are stored in the database in whichever form the uploading
// route produced — historically `getPublicUrl`, which yields
// `/storage/v1/object/public/{bucket}/{path}`. Signed and authenticated forms
// (`/object/sign/...`, `/object/{bucket}/...`) are accepted too so that rows
// written by any route parse identically. Returns null for anything that is
// not a recognised object URL in a proxied bucket.
export const parseStorageUrl = (
  url: string | null | undefined
): StorageObjectRef | null => {
  if (!url) return null;

  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }

  const marker = '/storage/v1/object/';
  const markerIndex = pathname.indexOf(marker);
  if (markerIndex === -1) return null;

  let rest = pathname.slice(markerIndex + marker.length);
  for (const prefix of ['public/', 'sign/', 'authenticated/']) {
    if (rest.startsWith(prefix)) {
      rest = rest.slice(prefix.length);
      break;
    }
  }

  const separator = rest.indexOf('/');
  if (separator === -1) return null;

  const bucket = decodeURIComponent(rest.slice(0, separator));
  const path = decodeURIComponent(rest.slice(separator + 1));

  if (!isProxiedBucket(bucket)) return null;
  if (!isValidObjectPath(path)) return null;

  return { bucket, path };
};

// Rewrites a stored storage URL into the proxy URL the browser should request.
// Returns null when the input is absent or unparseable, so callers can fall
// back to their existing "no image" branch rather than rendering a broken one.
//
// `version` cache-busts a replaced object at a stable path (profile photos and
// signature references overwrite in place), and is applied server-side so that
// callers never have to append a query string to a URL that already has one.
export const toProxyUrl = (
  url: string | null | undefined,
  options: { version?: string | number } = {}
): string | null => {
  const ref = parseStorageUrl(url);
  if (!ref) return null;

  const params = new URLSearchParams({ bucket: ref.bucket, path: ref.path });
  if (options.version !== undefined) {
    params.set('v', String(options.version));
  }
  return `/api/storage/object?${params.toString()}`;
};

export const downloadStorageObject = async (
  admin: SupabaseClient,
  url: string | null | undefined
): Promise<Buffer> => {
  const ref = parseStorageUrl(url);
  if (!ref) {
    throw new Error('Unrecognised storage URL');
  }

  const { data, error } = await admin.storage
    .from(ref.bucket)
    .download(ref.path);

  if (error || !data) {
    throw new Error(
      `Failed to download ${ref.bucket}/${ref.path}: ${error?.message ?? 'no data'}`
    );
  }

  return Buffer.from(await data.arrayBuffer());
};

// Deep-rewrites every recognised storage URL in an API response payload into
// its proxy equivalent, leaving all other values untouched.
//
// The list endpoints nest object URLs inside joined rows
// (`requester.photo_url`, `primary_officer.photo_url`, ...), and the set of
// such fields grows whenever a select adds a join. Walking the payload means a
// new nested field is covered automatically instead of silently shipping a
// URL the browser can no longer load.
//
// Apply this only on the way out to a client. Values written *into* the
// database or an audit entry must keep their canonical storage URL, which is
// what `downloadStorageObject` and the verification pipeline resolve against.
export const rewriteStorageUrls = <T>(payload: T): T => {
  if (typeof payload === 'string') {
    return (toProxyUrl(payload) ?? payload) as T;
  }

  if (Array.isArray(payload)) {
    return payload.map(rewriteStorageUrls) as T;
  }

  if (payload && typeof payload === 'object') {
    // Preserve non-plain objects (Date, Buffer, ...) rather than flattening
    // them into bare property bags.
    if (Object.getPrototypeOf(payload) !== Object.prototype) return payload;

    return Object.fromEntries(
      Object.entries(payload).map(([key, value]) => [
        key,
        rewriteStorageUrls(value),
      ])
    ) as T;
  }

  return payload;
};
