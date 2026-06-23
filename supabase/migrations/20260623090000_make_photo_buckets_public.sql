-- SmartKey — Make passport-photos and hod-signatures buckets public
-- Migration: 20260623090000_make_photo_buckets_public.sql
--
-- The original storage migration (20260605000001) declared these buckets public
-- so getPublicUrl works for verifier identity display, account settings, and HOD
-- signature/stamp previews. It used INSERT ... ON CONFLICT DO NOTHING, so on any
-- environment where the buckets already existed as private the public flag was
-- never applied. A getPublicUrl on a private bucket returns a JSON error body
-- rather than image bytes, which the browser blocks as ERR_BLOCKED_BY_ORB.
--
-- Reconcile the live state to the declared intent. weekend-letters stays private
-- on purpose (it is served via short-lived signed URLs).
UPDATE storage.buckets
SET public = true
WHERE id IN ('passport-photos', 'hod-signatures');
