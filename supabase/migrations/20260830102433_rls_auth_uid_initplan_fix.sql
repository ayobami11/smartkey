-- Perf advisor: 5 RLS policies re-evaluate auth.uid() per row instead of once per
-- query. Wrap each bare auth.uid() call in (select auth.uid()) so Postgres caches
-- it as an initplan. Logic is unchanged -- only the evaluation strategy.

ALTER POLICY notification_preferences_select_own ON public.notification_preferences
  USING (profile_id = (select auth.uid()));

ALTER POLICY notification_preferences_insert_own ON public.notification_preferences
  WITH CHECK (profile_id = (select auth.uid()));

ALTER POLICY notification_preferences_update_own ON public.notification_preferences
  USING (profile_id = (select auth.uid()))
  WITH CHECK (profile_id = (select auth.uid()));

ALTER POLICY profiles_update ON public.profiles
  USING ((id = (select auth.uid())) OR (user_role() = 'CSO'::text))
  WITH CHECK ((id = (select auth.uid())) OR (user_role() = 'CSO'::text));

ALTER POLICY guest_requesters_select_hod ON public.guest_requesters
  USING (
    EXISTS (
      SELECT 1
      FROM requests r
      JOIN profiles hod ON hod.id = (select auth.uid())
      WHERE r.guest_id = guest_requesters.id
        AND hod.role = 'DEAN'::user_role
        AND hod.unit_id IS NOT NULL
        AND (
          r.requested_unit_id = hod.unit_id
          OR EXISTS (SELECT 1 FROM keys k WHERE k.id = r.key_id AND k.unit_id = hod.unit_id)
        )
    )
  );
