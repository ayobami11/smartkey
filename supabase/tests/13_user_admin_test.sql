-- ---------------------------------------------------------------------------
-- 13 — update_user_profile and deactivate_user
--
-- Both replace a route that wrote the profile, then units.hod_id ("non-fatal"
-- on failure), then the audit entry in a separate call whose failure was
-- swallowed. They are CSO-only and read the actor from auth.uid(). The
-- one-Dean-per-unit rule is checked under a lock on the destination unit.
-- ---------------------------------------------------------------------------

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions;

select plan(24);

insert into auth.users (id, email) values
  ('13131313-1313-4131-8131-000000000001', 'pgtap.admin.cso@example.test'),
  ('13131313-1313-4131-8131-000000000002', 'pgtap.admin.deana@example.test'),
  ('13131313-1313-4131-8131-000000000003', 'pgtap.admin.deanb@example.test'),
  ('13131313-1313-4131-8131-000000000004', 'pgtap.admin.requester@example.test'),
  ('13131313-1313-4131-8131-000000000005', 'pgtap.admin.verifier@example.test'),
  ('13131313-1313-4131-8131-000000000006', 'pgtap.admin.deanc@example.test');

insert into public.units (id, name, faculty, authoriser) values
  ('13131313-1313-4131-8131-000000000010', 'pgTAP Admin Faculty A', 'pgTAP Admin Faculty A', 'DEAN'),
  ('13131313-1313-4131-8131-000000000011', 'pgTAP Admin Faculty B', 'pgTAP Admin Faculty B', 'DEAN'),
  ('13131313-1313-4131-8131-000000000012', 'pgTAP Admin Faculty C', 'pgTAP Admin Faculty C', 'DEAN');

insert into public.profiles (id, role, full_name, institutional_email, unit_id, status) values
  ('13131313-1313-4131-8131-000000000001', 'CSO',       'pgTAP Admin CSO',       'pgtap.admin.cso@example.test',       null,                                    'ACTIVE'),
  ('13131313-1313-4131-8131-000000000002', 'DEAN',      'pgTAP Admin Dean A',    'pgtap.admin.deana@example.test',     '13131313-1313-4131-8131-000000000010', 'ACTIVE'),
  ('13131313-1313-4131-8131-000000000003', 'DEAN',      'pgTAP Admin Dean B',    'pgtap.admin.deanb@example.test',     '13131313-1313-4131-8131-000000000011', 'ACTIVE'),
  ('13131313-1313-4131-8131-000000000004', 'REQUESTER', 'pgTAP Admin Requester', 'pgtap.admin.requester@example.test', '13131313-1313-4131-8131-000000000010', 'ACTIVE'),
  ('13131313-1313-4131-8131-000000000005', 'VERIFIER',  'pgTAP Admin Verifier',  'pgtap.admin.verifier@example.test',  null,                                    'ACTIVE'),
  ('13131313-1313-4131-8131-000000000006', 'DEAN',      'pgTAP Admin Dean C',    'pgtap.admin.deanc@example.test',     '13131313-1313-4131-8131-000000000012', 'DEACTIVATED');

update public.units set hod_id = '13131313-1313-4131-8131-000000000002' where id = '13131313-1313-4131-8131-000000000010';
update public.units set hod_id = '13131313-1313-4131-8131-000000000003' where id = '13131313-1313-4131-8131-000000000011';

-- ---------------------------------------------------------------------------
-- As a non-CSO
-- ---------------------------------------------------------------------------

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '13131313-1313-4131-8131-000000000004', 'role', 'authenticated')::text, true);
end;
$$;

select throws_ok(
  $$ select * from public.update_user_profile('13131313-1313-4131-8131-000000000004', 'Self Rename') $$,
  'P0002',
  'FORBIDDEN: only the CSO can edit users',
  'update_user_profile refuses a non-CSO'
);

select throws_ok(
  $$ select * from public.deactivate_user('13131313-1313-4131-8131-000000000003') $$,
  'P0002',
  'FORBIDDEN: only the CSO can deactivate users',
  'deactivate_user refuses a non-CSO'
);

-- ---------------------------------------------------------------------------
-- update_user_profile, as the CSO
-- ---------------------------------------------------------------------------

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '13131313-1313-4131-8131-000000000001', 'role', 'authenticated')::text, true);
end;
$$;

select throws_ok(
  $$ select * from public.update_user_profile('13131313-1313-4131-8131-000000000004', '   ') $$,
  'P0004',
  'VALIDATION: full_name is required',
  'a blank name is refused'
);

select throws_ok(
  $$ select * from public.update_user_profile('13131313-1313-4131-8131-0000000000ff', 'Nobody') $$,
  'P0007',
  'NOT_FOUND: profile 13131313-1313-4131-8131-0000000000ff does not exist',
  'an unknown profile is refused'
);

select throws_ok(
  $$ select * from public.update_user_profile('13131313-1313-4131-8131-000000000004', 'No Unit') $$,
  'P0004',
  'VALIDATION: unit is required for this role',
  'a departmental role needs a unit'
);

select throws_ok(
  $$ select * from public.update_user_profile(
       '13131313-1313-4131-8131-000000000004', 'Lost', '13131313-1313-4131-8131-0000000000fe') $$,
  'P0004',
  'VALIDATION: unit not found',
  'a move into a unit that does not exist is refused'
);

select throws_ok(
  $$ select * from public.update_user_profile(
       '13131313-1313-4131-8131-000000000002', 'pgTAP Admin Dean A', '13131313-1313-4131-8131-000000000011') $$,
  'P0006',
  'CONFLICT: that unit already has a Dean',
  'a Dean cannot move into a unit that already has an active Dean'
);

-- Unit C's only Dean is DEACTIVATED, so it counts as vacant.
create temp table t_u1 as
select * from public.update_user_profile(
  '13131313-1313-4131-8131-000000000002', 'pgTAP Admin Dean A', '13131313-1313-4131-8131-000000000012');

select is(
  (select unit_id from t_u1), '13131313-1313-4131-8131-000000000012'::uuid,
  'a Dean can move into a unit whose only Dean is deactivated'
);

select is(
  (select unit_id from public.profiles where id = '13131313-1313-4131-8131-000000000002'),
  '13131313-1313-4131-8131-000000000012'::uuid,
  'the profile records the new unit'
);

select is(
  (select hod_id from public.units where id = '13131313-1313-4131-8131-000000000010'),
  null,
  'the old unit no longer points at the Dean who left'
);

select is(
  (select hod_id from public.units where id = '13131313-1313-4131-8131-000000000012'),
  '13131313-1313-4131-8131-000000000002'::uuid,
  'the new unit points at its Dean, in the same transaction'
);

select is(
  (select count(*)::int from public.audit_log
   where event = 'USER_UPDATED'
     and target_id = '13131313-1313-4131-8131-000000000002'
     and payload->'changes'->'unit_id'->>'to' = '13131313-1313-4131-8131-000000000012'
     and not (payload->'changes' ? 'full_name')),
  1,
  'USER_UPDATED records only the unit change'
);

create temp table t_u2 as
select * from public.update_user_profile(
  '13131313-1313-4131-8131-000000000005', 'Renamed Verifier', '13131313-1313-4131-8131-000000000010');

select is(
  (select unit_id from t_u2), null,
  'a unit supplied for a non-departmental role is ignored'
);

select ok(
  (select (payload->'changes' ? 'full_name') and not (payload->'changes' ? 'unit_id')
   from public.audit_log
   where event = 'USER_UPDATED' and target_id = '13131313-1313-4131-8131-000000000005'),
  'renaming a Verifier records the name change and nothing else'
);

select lives_ok(
  $$ select * from public.update_user_profile(
       '13131313-1313-4131-8131-000000000004', '  Trimmed Name  ', '13131313-1313-4131-8131-000000000010') $$,
  'a requester can be renamed in place'
);

select is(
  (select full_name from public.profiles where id = '13131313-1313-4131-8131-000000000004'),
  'Trimmed Name',
  'the stored name is trimmed'
);

-- ---------------------------------------------------------------------------
-- deactivate_user, as the CSO
-- ---------------------------------------------------------------------------

create temp table t_d1 as
select * from public.deactivate_user('13131313-1313-4131-8131-000000000003');

select is((select status from t_d1), 'DEACTIVATED', 'deactivate_user answers DEACTIVATED');

select is(
  (select status::text from public.profiles where id = '13131313-1313-4131-8131-000000000003'),
  'DEACTIVATED',
  'the profile is deactivated'
);

select is(
  (select hod_id from public.units where id = '13131313-1313-4131-8131-000000000011'),
  null,
  'a deactivated Dean stops being the unit''s Dean'
);

select is(
  (select count(*)::int from public.audit_log
   where event = 'USER_DEACTIVATED'
     and target_id = '13131313-1313-4131-8131-000000000003'
     and payload->>'previous_status' = 'ACTIVE'),
  1,
  'the deactivation and its USER_DEACTIVATED entry commit together'
);

select throws_ok(
  $$ select * from public.deactivate_user('13131313-1313-4131-8131-000000000003') $$,
  'P0006',
  'CONFLICT: user is already deactivated',
  'deactivating twice is refused'
);

select throws_ok(
  $$ select * from public.deactivate_user('13131313-1313-4131-8131-0000000000ff') $$,
  'P0007',
  'NOT_FOUND: profile 13131313-1313-4131-8131-0000000000ff does not exist',
  'deactivating an unknown profile is refused'
);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.update_user_profile(uuid, text, uuid)', 'EXECUTE'),
  'anon cannot execute update_user_profile'
);

select ok(
  not has_function_privilege('anon', 'public.deactivate_user(uuid)', 'EXECUTE'),
  'anon cannot execute deactivate_user'
);

select * from finish();
rollback;
