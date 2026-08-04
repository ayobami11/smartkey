-- Backfilled from supabase_migrations.schema_migrations on 2026-08-04.
-- This migration was applied directly to the remote project (via the Supabase
-- dashboard or MCP) and was never committed. Recovered verbatim so that a fresh
-- replay of supabase/migrations/ reproduces production. Do not edit.

-- passport-photos: requester uploads to their own folder (userId/passport.ext)
CREATE POLICY "passport_photos_insert_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'passport-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "passport_photos_update_own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'passport-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'passport-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "passport_photos_select_authenticated"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'passport-photos');

-- hod-signatures: HOD uploads signature + stamp to their own folder
CREATE POLICY "hod_signatures_insert_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'hod-signatures'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "hod_signatures_update_own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'hod-signatures'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'hod-signatures'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "hod_signatures_select_authenticated"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'hod-signatures');
