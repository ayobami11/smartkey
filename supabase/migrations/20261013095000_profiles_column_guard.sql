-- Close the profiles self-update hole.
--
-- profiles_update (20260830102433) allows `id = auth.uid() OR user_role() =
-- 'CSO'`, and Supabase grants `authenticated` UPDATE on every public table by
-- default. Nothing restricted WHICH columns a session could change, so any
-- signed-in user could PATCH /rest/v1/profiles?id=eq.<self> with role=CSO,
-- status, unit_id, institutional_email or signature_ref_url — a privilege
-- escalation, and a way for a Dean to swap their own reference signature past
-- verification.
--
-- From a user session (PostgREST runs it as role `authenticated`) only
-- `full_name` may change. Every other column is written server-side: by the
-- service-role admin client in the API routes, or by SECURITY DEFINER RPCs,
-- whose body runs as the function owner — neither is `authenticated`, so the
-- guard passes them. The routes that used to write these columns with the
-- caller's session were moved to the admin client in the same change.
--
-- An allowlist (compare the whole row minus permitted columns) rather than a
-- blocklist, so a column added later is protected by default.

create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (to_jsonb(new) - 'full_name' - 'updated_at')
         is distinct from (to_jsonb(old) - 'full_name' - 'updated_at')
  then
    raise exception 'FORBIDDEN: only full_name can be changed from a user session'
      using errcode = 'P0002';
  end if;
  return new;
end;
$$;

revoke execute on function public.protect_profile_columns() from public, anon, authenticated;

drop trigger if exists profiles_protect_columns on public.profiles;
create trigger profiles_protect_columns
  before update on public.profiles
  for each row
  execute function public.protect_profile_columns();

-- Defence in depth: an anonymous caller has no business updating profiles at
-- all (RLS already yields no rows for anon; this removes the grant too).
revoke update on table public.profiles from anon;
