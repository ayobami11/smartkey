-- full_name length, enforced by the database.
--
-- The app caps a person's name at 120 characters, trimmed and non-empty
-- (FULL_NAME_MAX in src/lib/validation/primitives.ts), on every route that
-- writes one. The database accepted any length: provision_user,
-- update_user_profile, reinstate_user, record_invite_resent and
-- create_guest_weekend_request all take p_full_name as plain text, and those
-- RPCs are the boundary. A name written past the routes (an RPC called
-- directly with the service role, the SQL editor, a future route that forgets
-- the schema) could be any length — and full_name is copied into audit
-- snapshots and emails.
--
-- Existing rows are not changed. A name over 120 characters or blank is
-- identity data, so trimming or truncating it silently could make a profile
-- disagree with the person it names, and a blank one has no right value to
-- invent. Instead the migration checks first and stops with a clear message
-- if any row would violate the constraint; fix those rows by hand and apply
-- it again. The pre-check query is in docs/CHANGELOG.md (2026-10-19).
--
-- NOT VALID + VALIDATE: the constraints are added NOT VALID (enforced for
-- new writes at once, no full-table check under the ACCESS EXCLUSIVE lock)
-- and then validated, which scans under a SHARE UPDATE EXCLUSIVE lock that
-- does not block reads or writes. Both tables are small; the split is the
-- habit, not a necessity.
--
-- The check counts characters after btrim (spaces). The app's limit counts
-- UTF-16 code units after trimming all whitespace, which is never more
-- permissive, so anything the app accepts passes here.
--
-- Deploy order: either. The app already enforces the same limit. Run the
-- pre-check on production first; if it returns rows, this migration fails
-- and changes nothing until they are fixed.

do $$
declare
  v_profiles integer;
  v_guests   integer;
begin
  select count(*) into v_profiles
  from public.profiles
  where char_length(btrim(full_name)) not between 1 and 120;

  select count(*) into v_guests
  from public.guest_requesters
  where char_length(btrim(full_name)) not between 1 and 120;

  if v_profiles > 0 or v_guests > 0 then
    raise exception
      'full_name pre-check failed: % profiles row(s) and % guest_requesters row(s) have a full_name that is blank or longer than 120 characters after trimming. Fix them, then apply this migration again (query: docs/CHANGELOG.md, 2026-10-19).',
      v_profiles, v_guests;
  end if;
end;
$$;

alter table public.profiles
  add constraint profiles_full_name_length
  check (char_length(btrim(full_name)) between 1 and 120) not valid;

alter table public.profiles
  validate constraint profiles_full_name_length;

alter table public.guest_requesters
  add constraint guest_requesters_full_name_length
  check (char_length(btrim(full_name)) between 1 and 120) not valid;

alter table public.guest_requesters
  validate constraint guest_requesters_full_name_length;
