// What an uploaded file really is, read from its leading bytes.
//
// Every upload path stores the content type and extension this returns, never
// the browser-declared `File.type` or the user's filename. A declared type is
// whatever the client says: a PNG labelled `text/html`, or an
// `image/svg+xml` that carries script, would otherwise be stored with that
// type and served back from the app's own origin by GET /api/storage/object.
//
// Only raster images (PNG, JPEG, WebP) and, where a caller allows it, PDF are
// recognised. SVG is never accepted: it is XML, it can run script, and nothing
// in SmartKey needs a vector upload.
//
// The signature must sit at offset 0. A file that merely contains a PNG
// header somewhere (an HTML page with an embedded image, say) is rejected. A
// file that starts with a real signature and carries other content after it
// is accepted and stored under the detected type — which is safe, because it
// is only ever served as that image type with `nosniff` (see storage/object).
//
// Pure and dependency-free so the browser can run it before a direct upload
// (the requester's weekend letter) as well as the server.

export type UploadContentType =
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'application/pdf';

export type DetectedUpload = {
  contentType: UploadContentType;
  extension: 'png' | 'jpg' | 'webp' | 'pdf';
};

/** Which detected types a caller accepts. */
export type UploadKind = 'image' | 'image-or-pdf';

/** Leading bytes detectUploadType needs; read at least this many. */
export const SNIFF_BYTES = 16;

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const RIFF = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const WEBP = [0x57, 0x45, 0x42, 0x50]; // "WEBP", at offset 8
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

const startsWith = (bytes: Uint8Array, sig: number[], offset = 0) =>
  bytes.length >= offset + sig.length &&
  sig.every((b, i) => bytes[offset + i] === b);

const toBytes = (input: ArrayBuffer | Uint8Array): Uint8Array =>
  input instanceof Uint8Array ? input : new Uint8Array(input);

/** The real type of `input`, or null when it is not one SmartKey accepts. */
export const detectUploadType = (
  input: ArrayBuffer | Uint8Array
): DetectedUpload | null => {
  const bytes = toBytes(input);
  if (startsWith(bytes, PNG)) {
    return { contentType: 'image/png', extension: 'png' };
  }
  if (startsWith(bytes, JPEG)) {
    return { contentType: 'image/jpeg', extension: 'jpg' };
  }
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) {
    return { contentType: 'image/webp', extension: 'webp' };
  }
  if (startsWith(bytes, PDF)) {
    return { contentType: 'application/pdf', extension: 'pdf' };
  }
  return null;
};

/**
 * The type to store for an upload of `kind`, or null to reject it. A PDF is
 * accepted only for 'image-or-pdf' (weekend authorisation letters).
 */
export const checkUpload = (
  input: ArrayBuffer | Uint8Array,
  kind: UploadKind
): DetectedUpload | null => {
  const detected = detectUploadType(input);
  if (!detected) return null;
  if (detected.contentType === 'application/pdf' && kind !== 'image-or-pdf') {
    return null;
  }
  return detected;
};
