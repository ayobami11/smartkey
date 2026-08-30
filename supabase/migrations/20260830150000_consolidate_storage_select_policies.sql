-- SmartKey — One SELECT policy per storage bucket, correctly scoped
--
-- Two problems, both found while verifying 20260830140000_private_storage_buckets.
--
-- 1. DUPLICATE POLICIES. Production carried `hod_signatures_select`,
--    `passport_photos_select` and `weekend_letters_select` — already
--    owner-or-privileged-role scoped, and present in no committed migration
--    (applied straight to the project, like the two backfilled storage
--    migrations from 2026-06-05). 20260830140000 then added its own
--    near-duplicates, re-introducing exactly the duplicate-permissive-SELECT
--    pattern that 20260830102744_consolidate_permissive_select_policies
--    cleaned up. Permissive policies OR together, so the duplicate also
--    widened passport-photos to DEAN, which production had not granted.
--
-- 2. TWO WEEKEND-LETTERS POLICIES DID NOT SCOPE AT ALL, from the original
--    20260612101316_weekend_letters_bucket. `weekend_letters_select_own`
--    reads as an ownership check but its predicate only asserts the caller is
--    a REQUESTER — so every requester could read every object in the bucket.
--    `weekend_letters_select_hod` likewise gave every DEAN blanket read with
--    no unit check. Authorisation letters carry Dean signatures, which makes
--    this the same exposure 20260830140000 closed for `hod-signatures`, one
--    login deep. `weekend_letters_insert_requester` had the matching gap on
--    the write side: any REQUESTER could upload to any path in the bucket,
--    including another requester's folder or the `guest/` prefix.
--
-- Scoping note: the application does not read these buckets with a user
-- token. Every read goes through GET /api/storage/object or
-- GET /api/requests/[id]/letter, both of which use the service-role admin
-- client (bypassing RLS) and apply their own role and unit checks. These
-- policies are therefore a backstop for direct Storage API access, and are
-- deliberately no wider than the app needs — in particular DEAN gets no
-- blanket read here, because the Dean's letter preview goes through the
-- unit-scoped letter route rather than the Storage API.
--
-- Upload path conventions this relies on:
--   hod-signatures    {profileId}/signature|stamp.{ext}
--   passport-photos   {profileId}/passport.{ext}
--   weekend-letters   {requesterId}/{uuid}.{ext}   (registered requester)
--                     guest/{uuid}.{ext}           (service role, RLS bypassed)

-- hod-signatures: the owning Dean, and the CSO.

DROP POLICY IF EXISTS "hod_signatures_select" ON storage.objects;
DROP POLICY IF EXISTS "hod_signatures_select_own_or_cso" ON storage.objects;

CREATE POLICY "hod_signatures_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'hod-signatures'
    AND (
      (storage.foldername(name))[1] = (select auth.uid())::text
      OR public.user_role() = 'CSO'
    )
  );

-- passport-photos: the subject of the photo, plus the roles that identify
-- people at the desk. Matches what production already had; the DEAN grant
-- added by 20260830140000 is dropped, as no Storage-API read path needs it.

DROP POLICY IF EXISTS "passport_photos_select" ON storage.objects;
DROP POLICY IF EXISTS "passport_photos_select_staff_or_own" ON storage.objects;

CREATE POLICY "passport_photos_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'passport-photos'
    AND (
      (storage.foldername(name))[1] = (select auth.uid())::text
      OR public.user_role() IN ('CSO', 'VERIFIER')
    )
  );

-- weekend-letters: the requester who uploaded the letter, and the CSO.
-- Guest letters live under `guest/` and match no caller's uid, so they are
-- CSO-only here — the Dean reaches them through the letter route.

DROP POLICY IF EXISTS "weekend_letters_select" ON storage.objects;
DROP POLICY IF EXISTS "weekend_letters_select_hod" ON storage.objects;
DROP POLICY IF EXISTS "weekend_letters_select_own" ON storage.objects;

CREATE POLICY "weekend_letters_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'weekend-letters'
    AND (
      (storage.foldername(name))[1] = (select auth.uid())::text
      OR public.user_role() = 'CSO'
    )
  );

-- Write side: a requester may only upload into their own folder. Replaces
-- `weekend_letters_insert_requester`, which scoped to the role but not the
-- path. `weekend_letters_insert_own` (DEAN, own folder) is left alone.

DROP POLICY IF EXISTS "weekend_letters_insert_requester" ON storage.objects;

CREATE POLICY "weekend_letters_insert_requester"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'weekend-letters'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
    AND public.user_role() = 'REQUESTER'
  );
