// The extension to give an uploaded object, taken from the user's filename.
//
// Object paths must match isValidObjectPath (object-url.ts), and
// create_request re-checks weekend letters against the same pattern in SQL.
// A raw `name.split('.').pop()` breaks that for a name with no dot ("scan
// copy" becomes the whole name, space included) or an odd extension, and the
// upload then lands at a path the storage proxy refuses to serve. Anything
// that is not a short alphanumeric extension falls back instead.
export const uploadExtension = (fileName: string, fallback: string): string => {
  const dot = fileName.lastIndexOf('.');
  const raw = dot > 0 ? fileName.slice(dot + 1) : '';
  return /^[A-Za-z0-9]{1,8}$/.test(raw) ? raw.toLowerCase() : fallback;
};
