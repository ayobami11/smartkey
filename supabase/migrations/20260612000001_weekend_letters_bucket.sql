-- SmartKey — Storage: weekend-letters bucket
-- Stores HOD-signed approval letters uploaded when a requester submits a
-- weekend access request. Used by signature verification to compare the
-- embedded signature against the HOD's onboarded reference.
--
-- Upload path convention: {requestId}/letter.{ext}
-- Bucket is private (not public) — URLs must be signed or fetched server-side.

INSERT INTO storage.buckets (id, name, public)
VALUES ('weekend-letters', 'weekend-letters', false)
ON CONFLICT (id) DO NOTHING;

-- Requesters can upload a letter for their own request.
CREATE POLICY "weekend_letters_insert_requester"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'weekend-letters'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role = 'REQUESTER'
    )
  );

-- HOD can read letters for their department's requests.
CREATE POLICY "weekend_letters_select_hod"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'weekend-letters'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('HOD', 'CSO')
    )
  );

-- Requesters can read their own uploaded letters.
CREATE POLICY "weekend_letters_select_own"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'weekend-letters'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role = 'REQUESTER'
    )
  );
