-- SmartKey — Lock down passport-photos and hod-signatures

UPDATE storage.buckets
SET public = false
WHERE id IN ('passport-photos', 'hod-signatures');


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
