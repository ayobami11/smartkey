-- SmartKey — Lock down passport-photos and hod-signatures
--
-- Both buckets were public. 20260623000316_make_photo_buckets_public.sql set
-- that deliberately, to fix broken images: getPublicUrl on a private bucket
-- returns a JSON error body that the browser blocks as ERR_BLOCKED_BY_ORB.
-- The symptom was real; making the buckets world-readable was the wrong cure.
--
-- Object paths are deterministic — `{profileId}/signature.png`,
-- `{profileId}/passport.jpg` — and profile UUIDs are handed out routinely in
-- verifier queue and CSO/Dean listing payloads. A public bucket therefore made
-- every Dean's reference signature a permanent, unrevocable URL readable by
-- anyone who had ever seen a profile id, with no session and no audit trail.
--
-- For hod-signatures that is not merely a privacy leak, it defeats a control:
-- the reference signature is exactly the image an attacker needs to submit
-- back as their "signed" weekend approval and score a 0% mismatch, sailing
-- under SIGNATURE_DIFF_THRESHOLD. Signature verification only means anything
-- while the reference is not obtainable by the person being verified against.
--
-- Reads now go through GET /api/storage/object, which authorises per request
-- against the caller's session.
--
-- CDN CAVEAT: flipping `public` does NOT immediately invalidate URLs already
-- in circulation. Public objects are served with `cache-control: public,
-- max-age=3600` and cached at the Supabase CDN edge, so any object fetched
-- while the bucket was public keeps returning 200 to anonymous requests until
-- its cached copy expires. Verified after applying this migration: a Dean's
-- signature still came back 200 with the full 18KB image body and
-- `cf-cache-status: HIT`, on a bucket already marked private. Objects not in
-- cache 400 immediately. Re-uploading an object purges its cached copy;
-- otherwise the window closes on its own within the hour.
--
-- Neither path helps against a copy someone already downloaded. A reference
-- signature that was actually exfiltrated has to be re-onboarded before it
-- means anything again.
--
-- NOTE ON ORDERING: this migration must not be applied until the application
-- code that reads through the proxy is deployed. Applied first, it breaks
-- every profile photo and signature preview in the running app.

UPDATE storage.buckets
SET public = false
WHERE id IN ('passport-photos', 'hod-signatures');

-- Flipping `public` alone is not sufficient. A public bucket bypasses RLS for
-- reads, so the bucket's SELECT policies are dormant until it goes private, at
-- which point they become the live authorisation rule.
--
-- The two policies dropped below (from 20260605143804_storage_rls_policies.sql)
-- granted every authenticated user every object in the bucket. Note that
-- production also carries `hod_signatures_select` / `passport_photos_select`
-- policies that are already owner-or-privileged-role scoped and exist in no
-- committed migration — so on production the policies created here are
-- near-duplicates of those. They are kept for environments replayed from
-- migrations alone, where the uncommitted pair does not exist.
--
-- The application does not depend on either: reads go through the service-role
-- admin client in GET /api/storage/object, which bypasses RLS and applies its
-- own per-role check. These are defence in depth for direct Storage API access
-- with a user token.

DROP POLICY IF EXISTS "hod_signatures_select_authenticated" ON storage.objects;

CREATE POLICY "hod_signatures_select_own_or_cso"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'hod-signatures'
    AND (
      (storage.foldername(name))[1] = (select auth.uid())::text
      OR public.user_role() = 'CSO'
    )
  );

DROP POLICY IF EXISTS "passport_photos_select_authenticated" ON storage.objects;

-- Identity photos are shown to the verifier at the desk and in the Dean/CSO
-- request queues, so those roles keep blanket read. A requester keeps access
-- to their own photo only — previously any requester could read any other
-- requester's.
CREATE POLICY "passport_photos_select_staff_or_own"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'passport-photos'
    AND (
      (storage.foldername(name))[1] = (select auth.uid())::text
      OR public.user_role() IN ('CSO', 'DEAN', 'VERIFIER')
    )
  );
