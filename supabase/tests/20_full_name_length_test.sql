-- ---------------------------------------------------------------------------
-- 20 — full_name length (20261019100100_full_name_length.sql)
--
--   * profiles_full_name_length and guest_requesters_full_name_length exist
--     and are validated.
--   * Both refuse a name that is blank or over 120 characters after trimming,
--     on insert and on update, and accept exactly 120 (surrounding spaces
--     not counted).
--   * The limit holds through an RPC that took any length before
--     (update_user_profile).
-- ---------------------------------------------------------------------------

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions;

select plan(14);

insert into auth.users (id, email) values
  ('20202020-2020-4202-8202-000000000001', 'pgtap.g20.cso@example.test'),
  ('20202020-2020-4202-8202-000000000002', 'pgtap.g20.requester@example.test'),
  ('20202020-2020-4202-8202-000000000003', 'pgtap.g20.long@example.test'),
  ('20202020-2020-4202-8202-000000000004', 'pgtap.g20.blank@example.test'),
  ('20202020-2020-4202-8202-000000000005', 'pgtap.g20.max@example.test'),
  ('20202020-2020-4202-8202-000000000006', 'pgtap.g20.padded@example.test');

insert into public.units (id, name, faculty, authoriser) values
  ('20202020-2020-4202-8202-000000000010', 'pgTAP G20 Faculty', 'pgTAP G20 Faculty', 'DEAN');

insert into public.profiles (id, role, full_name, institutional_email, unit_id, status) values
  ('20202020-2020-4202-8202-000000000001', 'CSO',       'pgTAP G20 CSO',       'pgtap.g20.cso@example.test',       null,                                    'ACTIVE'),
  ('20202020-2020-4202-8202-000000000002', 'REQUESTER', 'pgTAP G20 Requester', 'pgtap.g20.requester@example.test', '20202020-2020-4202-8202-000000000010', 'ACTIVE');

-- ---------------------------------------------------------------------------
-- The constraints
-- ---------------------------------------------------------------------------

select ok(
  exists (select 1 from pg_constraint
          where conrelid = 'public.profiles'::regclass
            and conname = 'profiles_full_name_length'
            and contype = 'c' and convalidated),
  'profiles_full_name_length exists and is validated'
);

select ok(
  exists (select 1 from pg_constraint
          where conrelid = 'public.guest_requesters'::regclass
            and conname = 'guest_requesters_full_name_length'
            and contype = 'c' and convalidated),
  'guest_requesters_full_name_length exists and is validated'
);

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

select throws_ok(
  $$insert into public.profiles (id, role, full_name, institutional_email, status)
    values ('20202020-2020-4202-8202-000000000003', 'VERIFIER', repeat('x', 121), 'pgtap.g20.long@example.test', 'ACTIVE')$$,
  '23514',
  'new row for relation "profiles" violates check constraint "profiles_full_name_length"',
  'profiles refuses a 121-character name'
);

select throws_ok(
  $$insert into public.profiles (id, role, full_name, institutional_email, status)
    values ('20202020-2020-4202-8202-000000000004', 'VERIFIER', '   ', 'pgtap.g20.blank@example.test', 'ACTIVE')$$,
  '23514',
  'new row for relation "profiles" violates check constraint "profiles_full_name_length"',
  'profiles refuses a blank name'
);

select throws_ok(
  $$insert into public.profiles (id, role, full_name, institutional_email, status)
    values ('20202020-2020-4202-8202-000000000004', 'VERIFIER', '', 'pgtap.g20.blank@example.test', 'ACTIVE')$$,
  '23514',
  'new row for relation "profiles" violates check constraint "profiles_full_name_length"',
  'profiles refuses an empty name'
);

select lives_ok(
  $$insert into public.profiles (id, role, full_name, institutional_email, status)
    values ('20202020-2020-4202-8202-000000000005', 'VERIFIER', repeat('x', 120), 'pgtap.g20.max@example.test', 'ACTIVE')$$,
  'profiles accepts exactly 120 characters'
);

select lives_ok(
  $$insert into public.profiles (id, role, full_name, institutional_email, status)
    values ('20202020-2020-4202-8202-000000000006', 'VERIFIER', '  ' || repeat('x', 120) || '  ', 'pgtap.g20.padded@example.test', 'ACTIVE')$$,
  'surrounding spaces do not count towards the 120'
);

select throws_ok(
  $$update public.profiles set full_name = repeat('x', 121)
    where id = '20202020-2020-4202-8202-000000000002'$$,
  '23514',
  'new row for relation "profiles" violates check constraint "profiles_full_name_length"',
  'profiles refuses an update to 121 characters'
);

-- ---------------------------------------------------------------------------
-- guest_requesters
-- ---------------------------------------------------------------------------

select throws_ok(
  $$insert into public.guest_requesters (full_name, email, id_document_type, id_document_number)
    values (repeat('x', 121), 'pgtap.g20.guest@example.test', 'National ID', 'PGG-ID-2001')$$,
  '23514',
  'new row for relation "guest_requesters" violates check constraint "guest_requesters_full_name_length"',
  'guest_requesters refuses a 121-character name'
);

select throws_ok(
  $$insert into public.guest_requesters (full_name, email, id_document_type, id_document_number)
    values ('   ', 'pgtap.g20.guest@example.test', 'National ID', 'PGG-ID-2002')$$,
  '23514',
  'new row for relation "guest_requesters" violates check constraint "guest_requesters_full_name_length"',
  'guest_requesters refuses a blank name'
);

select lives_ok(
  $$insert into public.guest_requesters (id, full_name, email, id_document_type, id_document_number)
    values ('20202020-2020-4202-8202-000000000030', repeat('x', 120), 'pgtap.g20.guest@example.test', 'National ID', 'PGG-ID-2003')$$,
  'guest_requesters accepts exactly 120 characters'
);

select throws_ok(
  $$update public.guest_requesters set full_name = repeat('x', 121)
    where id = '20202020-2020-4202-8202-000000000030'$$,
  '23514',
  'new row for relation "guest_requesters" violates check constraint "guest_requesters_full_name_length"',
  'guest_requesters refuses an update to 121 characters'
);

-- ---------------------------------------------------------------------------
-- Through an RPC that accepted any length
-- ---------------------------------------------------------------------------

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '20202020-2020-4202-8202-000000000001', 'role', 'authenticated')::text, true);
end;
$$;

select throws_ok(
  $$select * from public.update_user_profile(
      '20202020-2020-4202-8202-000000000002', repeat('x', 121), '20202020-2020-4202-8202-000000000010')$$,
  '23514',
  'new row for relation "profiles" violates check constraint "profiles_full_name_length"',
  'update_user_profile can no longer store a 121-character name'
);

select is(
  (select full_name from public.profiles where id = '20202020-2020-4202-8202-000000000002'),
  'pgTAP G20 Requester',
  'the refused rename left the profile unchanged'
);

select * from finish();

rollback;
