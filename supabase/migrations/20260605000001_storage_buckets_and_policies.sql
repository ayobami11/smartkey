-- SmartKey — Storage buckets and RLS policies
-- Migration: 20260605000001_storage_buckets_and_policies.sql
--
-- Creates the Supabase Storage buckets used during onboarding and their RLS
-- policies. Without these, the activate (REQUESTER passport photo) and
-- activate-hod (signature + stamp) flows fail on upload and the profile never
-- transitions to ACTIVE.
--
-- Upload path convention (set in the API routes):
--   passport-photos:  {userId}/passport.{ext}
--   hod-signatures:   {userId}/signature.{ext}  and  {userId}/stamp.{ext}
-- so (storage.foldername(name))[1] is always the owner's auth.uid().

-- Buckets (public read so getPublicUrl works for verifier identity display, etc.)
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('passport-photos', 'passport-photos', true),
  ('hod-signatures', 'hod-signatures', true)
ON CONFLICT (id) DO NOTHING;

-- passport-photos: requester writes only to their own folder
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

-- hod-signatures: HOD writes signature + stamp only to their own folder
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
