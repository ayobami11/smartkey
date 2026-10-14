-- SmartKey — Restrict what each storage bucket accepts
--
-- Defence in depth for the upload content-type fix of 2026-10-14. Every
-- server-side upload path now detects the real type from the file's bytes
-- (src/lib/storage/upload-type.ts) and stores that type, and
-- GET /api/storage/object serves by sniffing the bytes regardless of the
-- stored type. One path is outside the server's reach, though: the requester's
-- weekend letter and stamp are uploaded straight from the browser to
-- `weekend-letters`, with whatever content type the client sends.
--
-- Storage checks `allowed_mime_types` against the content type an upload
-- declares, and `file_size_limit` against its size, for every client
-- including the service role. That cannot stop a file whose bytes disagree
-- with its declared type (the serving side and /api/requests/submit's
-- read-back cover that), but it does stop an upload that openly declares
-- image/svg+xml or text/html, and caps a direct browser upload at the same
-- 5 MB the routes enforce.
--
-- No SVG anywhere. PDF only in weekend-letters (guest authorisation letters).
-- Objects already stored are unaffected; these limits apply to new uploads.
--
-- DEPLOY ORDER: apply after, or together with, the application deploy. The
-- previous guest route stored the declared type as-is and accepted
-- 'image/jpg', which this list refuses; the new code only ever sends the
-- four canonical types below.

update storage.buckets
set
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'],
  file_size_limit = 5242880
where id in ('passport-photos', 'hod-signatures');

update storage.buckets
set
  allowed_mime_types = array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/pdf'
  ],
  file_size_limit = 5242880
where id = 'weekend-letters';
