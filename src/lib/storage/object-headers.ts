// Response headers for GET /api/storage/object.
import { detectUploadType } from '@/lib/storage/upload-type';

const CACHE_CONTROL = 'private, max-age=300, must-revalidate';

// Applied to every object this route serves. It does nothing for an <img>
// (CSP on an image response is ignored there), but it is the backstop when a
// user opens the URL directly: even if a browser rendered the response as a
// document, `sandbox` gives it an opaque origin with scripts disabled, and
// `default-src 'none'` stops it loading anything.
export const OBJECT_CSP =
  "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox";

// Raster images are the only thing a page embeds from this route, so they are
// the only thing served inline.
const INLINE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

// The headers to serve `head` (the object's leading bytes) with.
//
// The type comes from the bytes, never from the content type stored with the
// object. That stored type is whatever the uploader declared: until
// 2026-10-14 the upload routes saved the browser's `File.type` as-is, so an
// object already in a bucket can be an SVG with script, or HTML labelled
// image/png. Sniffing here protects those objects as well as new ones.
//
// - PNG / JPEG / WebP → that type, inline.
// - PDF → application/pdf as an attachment. A PDF opened inline would render
//   in the browser's viewer on the app origin, and Chrome refuses to render a
//   PDF under the `sandbox` directive at all; nothing in the app embeds one
//   from this route (letters are viewed through Supabase signed URLs).
// - anything else → application/octet-stream as an attachment.
export const objectResponseHeaders = (
  head: Uint8Array
): Record<string, string> => {
  const detected = detectUploadType(head)?.contentType;
  const inline = detected !== undefined && INLINE_TYPES.has(detected);
  return {
    'Content-Type': detected ?? 'application/octet-stream',
    'Content-Disposition': inline ? 'inline' : 'attachment',
    'Content-Security-Policy': OBJECT_CSP,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': CACHE_CONTROL,
  };
};
