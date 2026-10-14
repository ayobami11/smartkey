-- ---------------------------------------------------------------------------
-- 16 — reinstate_user, record_invite_resent, create_key, and the dropped
--      incidents / keys insert policies
--
-- Reinstating a deactivated user, re-sending an invite and creating a key
-- each changed state with no audit entry. They are now CSO-only RPCs that
-- read the actor from auth.uid() and write their audit entry in the same
-- transaction. The incidents_insert_cso_verifier and keys_insert_cso RLS
-- policies are gone, so a user session can no longer skip those RPCs (and
-- log_incident / mark_key_lost) with a direct insert.
--
-- The caller is set through request.jwt.claims (same as 13/15). The direct
-- insert checks switch to the authenticated role inside DO blocks and stash
-- the outcome in a GUC (see 03 for why).
-- ---------------------------------------------------------------------------

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions;

select plan(45);

insert into auth.users (id, email) values
  ('16161616-1616-4161-8161-000000000001', 'pgtap.adm16.cso@example.test'),
  ('16161616-1616-4161-8161-000000000002', 'pgtap.adm16.requester@example.test'),
  ('16161616-1616-4161-8161-000000000003', 'pgtap.adm16.deactivated.dean@example.test'),
  ('16161616-1616-4161-8161-000000000004', 'pgtap.adm16.pending@example.test'),
  ('16161616-1616-4161-8161-000000000005', 'pgtap.adm16.active@example.test'),
  ('16161616-1616-4161-8161-000000000006', 'pgtap.adm16.deanb@example.test'),
  ('16161616-1616-4161-8161-000000000007', 'pgtap.adm16.deactivated.req@example.test'),
  ('16161616-1616-4161-8161-000000000008', 'pgtap.adm16.pending.dean@example.test'),
  ('16161616-1616-4161-8161-000000000009', 'pgtap.adm16.deactivated.ver@example.test');

insert into public.units (id, name, faculty, authoriser) values
  ('16161616-1616-4161-8161-000000000010', 'pgTAP Adm16 Faculty A', 'pgTAP Adm16 Faculty A', 'DEAN'),
  ('16161616-1616-4161-8161-000000000011', 'pgTAP Adm16 Faculty B', 'pgTAP Adm16 Faculty B', 'DEAN'),
  ('16161616-1616-4161-8161-000000000012', 'pgTAP Adm16 Faculty C', 'pgTAP Adm16 Faculty C', 'DEAN');

insert into public.profiles (id, role, full_name, institutional_email, unit_id, status) values
  ('16161616-1616-4161-8161-000000000001', 'CSO',       'pgTAP Adm16 CSO',            'pgtap.adm16.cso@example.test',              null,                                    'ACTIVE'),
  ('16161616-1616-4161-8161-000000000002', 'REQUESTER', 'pgTAP Adm16 Requester',      'pgtap.adm16.requester@example.test',        '16161616-1616-4161-8161-000000000010', 'ACTIVE'),
  ('16161616-1616-4161-8161-000000000003', 'DEAN',      'pgTAP Adm16 Former Dean',    'pgtap.adm16.deactivated.dean@example.test', '16161616-1616-4161-8161-000000000010', 'DEACTIVATED'),
  ('16161616-1616-4161-8161-000000000004', 'REQUESTER', 'pgTAP Adm16 Pending',        'pgtap.adm16.pending@example.test',          '16161616-1616-4161-8161-000000000010', 'PENDING_ACTIVATION'),
  ('16161616-1616-4161-8161-000000000005', 'REQUESTER', 'pgTAP Adm16 Active',         'pgtap.adm16.active@example.test',           '16161616-1616-4161-8161-000000000010', 'ACTIVE'),
  ('16161616-1616-4161-8161-000000000006', 'DEAN',      'pgTAP Adm16 Dean B',         'pgtap.adm16.deanb@example.test',            '16161616-1616-4161-8161-000000000011', 'ACTIVE'),
  ('16161616-1616-4161-8161-000000000007', 'REQUESTER', 'pgTAP Adm16 Former Req',     'pgtap.adm16.deactivated.req@example.test',  '16161616-1616-4161-8161-000000000010', 'DEACTIVATED'),
  ('16161616-1616-4161-8161-000000000008', 'DEAN',      'pgTAP Adm16 Pending Dean',   'pgtap.adm16.pending.dean@example.test',     '16161616-1616-4161-8161-000000000010', 'PENDING_ACTIVATION'),
  ('16161616-1616-4161-8161-000000000009', 'VERIFIER',  'pgTAP Adm16 Former Verifier','pgtap.adm16.deactivated.ver@example.test',   null,                                    'DEACTIVATED');

update public.units set hod_id = '16161616-1616-4161-8161-000000000006' where id = '16161616-1616-4161-8161-000000000011';

-- ---------------------------------------------------------------------------
-- No session
-- ---------------------------------------------------------------------------

do $$
begin
  perform set_config('request.jwt.claims', '{}', true);
end;
$$;

select throws_ok(
  $$ select * from public.reinstate_user('16161616-1616-4161-8161-000000000003') $$,
  'P0001', 'NOT_AUTHENTICATED',
  'reinstate_user refuses a call with no session'
);

select throws_ok(
  $$ select * from public.record_invite_resent('16161616-1616-4161-8161-000000000004') $$,
  'P0001', 'NOT_AUTHENTICATED',
  'record_invite_resent refuses a call with no session'
);

select throws_ok(
  $$ select * from public.create_key('PGK-1601', 'NEW_SENATE', 'pgTAP Room', '16161616-1616-4161-8161-000000000010') $$,
  'P0001', 'NOT_AUTHENTICATED',
  'create_key refuses a call with no session'
);

-- ---------------------------------------------------------------------------
-- As a non-CSO
-- ---------------------------------------------------------------------------

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '16161616-1616-4161-8161-000000000002', 'role', 'authenticated')::text, true);
end;
$$;

select throws_ok(
  $$ select * from public.reinstate_user('16161616-1616-4161-8161-000000000003') $$,
  'P0002', 'FORBIDDEN: only the CSO can reinstate users',
  'reinstate_user refuses a non-CSO'
);

select throws_ok(
  $$ select * from public.record_invite_resent('16161616-1616-4161-8161-000000000004') $$,
  'P0002', 'FORBIDDEN: only the CSO can re-send an invite',
  'record_invite_resent refuses a non-CSO'
);

select throws_ok(
  $$ select * from public.create_key('PGK-1601', 'NEW_SENATE', 'pgTAP Room', '16161616-1616-4161-8161-000000000010') $$,
  'P0002', 'FORBIDDEN: only the CSO can create keys',
  'create_key refuses a non-CSO'
);

-- ---------------------------------------------------------------------------
-- reinstate_user, as the CSO
-- ---------------------------------------------------------------------------

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '16161616-1616-4161-8161-000000000001', 'role', 'authenticated')::text, true);
end;
$$;

select throws_ok(
  $$ select * from public.reinstate_user('16161616-1616-4161-8161-0000000000ff') $$,
  'P0007', 'NOT_FOUND: profile 16161616-1616-4161-8161-0000000000ff does not exist',
  'reinstate_user refuses an unknown profile'
);

select throws_ok(
  $$ select * from public.reinstate_user('16161616-1616-4161-8161-000000000004') $$,
  'P0006', 'CONFLICT: user is not deactivated',
  'reinstate_user refuses a user who is not deactivated'
);

select throws_ok(
  $$ select * from public.reinstate_user(
       '16161616-1616-4161-8161-000000000003', null, '16161616-1616-4161-8161-000000000011') $$,
  'P0006', 'CONFLICT: that unit already has an active Dean',
  'a Dean cannot be reinstated into a unit with an active Dean'
);

select throws_ok(
  $$ select * from public.reinstate_user(
       '16161616-1616-4161-8161-000000000003', null, '16161616-1616-4161-8161-0000000000fe') $$,
  'P0004', 'VALIDATION: unit not found',
  'reinstate_user refuses a unit that does not exist'
);

select is(
  (select count(*)::int from public.audit_log
   where event = 'USER_REINSTATED'
     and target_id in ('16161616-1616-4161-8161-000000000003',
                       '16161616-1616-4161-8161-000000000004')),
  0,
  'no USER_REINSTATED entry is written for a refused call'
);

create temp table t_r1 as
select * from public.reinstate_user(
  '16161616-1616-4161-8161-000000000003', '  pgTAP Adm16 Dean Back  ', '16161616-1616-4161-8161-000000000012');

select is(
  (select status || '|' || role from t_r1),
  'PENDING_ACTIVATION|DEAN',
  'reinstate_user answers PENDING_ACTIVATION and the stored role'
);

select is(
  (select status::text || '|' || unit_id::text || '|' || full_name
   from public.profiles where id = '16161616-1616-4161-8161-000000000003'),
  'PENDING_ACTIVATION|16161616-1616-4161-8161-000000000012|pgTAP Adm16 Dean Back',
  'the profile is pending again, in its new unit, under the trimmed name'
);

select is(
  (select hod_id from public.units where id = '16161616-1616-4161-8161-000000000012'),
  '16161616-1616-4161-8161-000000000003'::uuid,
  'the reinstated Dean is the unit''s Dean again, in the same transaction'
);

select is(
  (select count(*)::int from public.audit_log
   where event = 'USER_REINSTATED'
     and target_type = 'profile'
     and target_id = '16161616-1616-4161-8161-000000000003'
     and actor_id = '16161616-1616-4161-8161-000000000001'
     and actor_role = 'CSO'
     and payload->>'reinstated_by' = '16161616-1616-4161-8161-000000000001'
     and payload->>'previous_status' = 'DEACTIVATED'
     and payload->>'status' = 'PENDING_ACTIVATION'
     and payload->'changes'->'unit_id'->>'to' = '16161616-1616-4161-8161-000000000012'
     and payload->'changes'->'full_name'->>'to' = 'pgTAP Adm16 Dean Back'),
  1,
  'exactly one USER_REINSTATED entry commits with the reinstatement'
);

create temp table t_r2 as
select * from public.reinstate_user('16161616-1616-4161-8161-000000000007');

select is(
  (select status::text || '|' || unit_id::text || '|' || full_name
   from public.profiles where id = '16161616-1616-4161-8161-000000000007'),
  'PENDING_ACTIVATION|16161616-1616-4161-8161-000000000010|pgTAP Adm16 Former Req',
  'with no name or unit given, the stored ones are kept'
);

select is(
  (select payload->'changes' from public.audit_log
   where event = 'USER_REINSTATED' and target_id = '16161616-1616-4161-8161-000000000007'),
  '{}'::jsonb,
  'USER_REINSTATED records no changes when nothing but the status changed'
);

-- ---------------------------------------------------------------------------
-- record_invite_resent, as the CSO
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select * from public.record_invite_resent('16161616-1616-4161-8161-000000000005') $$,
  'P0006', 'CONFLICT: user is already active',
  'record_invite_resent refuses an active user'
);

select throws_ok(
  $$ select * from public.record_invite_resent('16161616-1616-4161-8161-000000000009') $$,
  'P0006', 'CONFLICT: user is deactivated',
  'record_invite_resent refuses a deactivated user (reinstate first)'
);

select throws_ok(
  $$ select * from public.record_invite_resent('16161616-1616-4161-8161-0000000000ff') $$,
  'P0007', 'NOT_FOUND: profile 16161616-1616-4161-8161-0000000000ff does not exist',
  'record_invite_resent refuses an unknown profile'
);

select throws_ok(
  $$ select * from public.record_invite_resent(
       '16161616-1616-4161-8161-000000000004', null, '16161616-1616-4161-8161-0000000000fe') $$,
  'P0004', 'VALIDATION: unit not found',
  'record_invite_resent refuses a unit that does not exist'
);

select throws_ok(
  $$ select * from public.record_invite_resent(
       '16161616-1616-4161-8161-000000000008', null, '16161616-1616-4161-8161-000000000011') $$,
  'P0006', 'CONFLICT: that unit already has an active Dean',
  'a pending Dean cannot be moved into a unit with an active Dean'
);

create temp table t_i1 as
select * from public.record_invite_resent('16161616-1616-4161-8161-000000000004');

select is(
  (select status || '|' || role || '|' || institutional_email from t_i1),
  'PENDING_ACTIVATION|REQUESTER|pgtap.adm16.pending@example.test',
  'record_invite_resent answers the status, role and email the route needs'
);

select is(
  (select full_name || '|' || unit_id::text from public.profiles
   where id = '16161616-1616-4161-8161-000000000004'),
  'pgTAP Adm16 Pending|16161616-1616-4161-8161-000000000010',
  'a plain re-send leaves the profile as it was'
);

select is(
  (select count(*)::int from public.audit_log
   where event = 'USER_INVITE_RESENT'
     and target_type = 'profile'
     and target_id = '16161616-1616-4161-8161-000000000004'
     and actor_role = 'CSO'
     and payload->>'resent_by' = '16161616-1616-4161-8161-000000000001'
     and payload->>'institutional_email' = 'pgtap.adm16.pending@example.test'
     and payload->'changes' = '{}'::jsonb),
  1,
  'exactly one USER_INVITE_RESENT entry is written for the re-send'
);

create temp table t_i2 as
select * from public.record_invite_resent(
  '16161616-1616-4161-8161-000000000004', 'pgTAP Adm16 Renamed', '16161616-1616-4161-8161-000000000011');

select is(
  (select full_name || '|' || unit_id::text from public.profiles
   where id = '16161616-1616-4161-8161-000000000004'),
  'pgTAP Adm16 Renamed|16161616-1616-4161-8161-000000000011',
  'a re-invite from the form applies its name and unit correction'
);

select is(
  (select count(*)::int from public.audit_log
   where event = 'USER_INVITE_RESENT'
     and target_id = '16161616-1616-4161-8161-000000000004'
     and payload->'changes'->'full_name'->>'to' = 'pgTAP Adm16 Renamed'
     and payload->'changes'->'unit_id'->>'to' = '16161616-1616-4161-8161-000000000011'),
  1,
  'the correction is recorded on that re-send''s USER_INVITE_RESENT entry'
);

-- ---------------------------------------------------------------------------
-- create_key, as the CSO
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select * from public.create_key('ns-1601', 'NEW_SENATE', 'pgTAP Room', '16161616-1616-4161-8161-000000000010') $$,
  'P0004', 'VALIDATION: code must look like NS-304',
  'create_key refuses a malformed code'
);

select throws_ok(
  $$ select * from public.create_key('PGK-1601', 'NEW_SENATE', '   ', '16161616-1616-4161-8161-000000000010') $$,
  'P0004', 'VALIDATION: zone and room_name are required',
  'create_key refuses a blank room name'
);

select throws_ok(
  $$ select * from public.create_key('PGK-1601', 'NEW_SENATE', 'pgTAP Room', '16161616-1616-4161-8161-000000000010', 21) $$,
  'P0004', 'VALIDATION: key_count must be between 1 and 20',
  'create_key refuses more than 20 copies'
);

select throws_ok(
  $$ select * from public.create_key('PGK-1601', 'NEW_SENATE', 'pgTAP Room', '16161616-1616-4161-8161-0000000000fe') $$,
  'P0004', 'VALIDATION: unit not found',
  'create_key refuses a unit that does not exist'
);

create temp table t_k1 as
select * from public.create_key(
  'PGK-1601', 'OLD_SENATE', '  pgTAP Room 1601  ', '16161616-1616-4161-8161-000000000010', 3);

select is(
  (select count(*)::int from public.keys k, t_k1
   where k.id = t_k1.key_id
     and k.code = 'PGK-1601'
     and k.zone = 'OLD_SENATE'
     and k.room_name = 'pgTAP Room 1601'
     and k.unit_id = '16161616-1616-4161-8161-000000000010'
     and k.key_count = 3
     and k.status = 'AVAILABLE'),
  1,
  'create_key inserts an AVAILABLE key with the trimmed room name and its copies'
);

select is(
  (select count(*)::int from public.audit_log a, t_k1
   where a.event = 'KEY_CREATED'
     and a.target_type = 'key'
     and a.target_id = t_k1.key_id
     and a.actor_id = '16161616-1616-4161-8161-000000000001'
     and a.actor_role = 'CSO'
     and a.payload->>'key_id' = t_k1.key_id::text
     and a.payload->>'code' = 'PGK-1601'
     and a.payload->>'zone' = 'OLD_SENATE'
     and a.payload->>'room_name' = 'pgTAP Room 1601'
     and a.payload->>'unit_id' = '16161616-1616-4161-8161-000000000010'
     and (a.payload->>'key_count')::int = 3),
  1,
  'exactly one KEY_CREATED entry commits with the key'
);

select throws_ok(
  $$ select * from public.create_key('PGK-1601', 'NEW_SENATE', 'Another Room', '16161616-1616-4161-8161-000000000010') $$,
  'P0006', 'CONFLICT: key code PGK-1601 is already in use',
  'create_key refuses a code that is already in use'
);

select is(
  (select count(*)::int from public.audit_log
   where event = 'KEY_CREATED' and payload->>'code' in ('PGK-1601', 'ns-1601')),
  1,
  'refused create_key calls write no KEY_CREATED entry'
);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.reinstate_user(uuid, text, uuid)', 'EXECUTE'),
  'anon cannot execute reinstate_user'
);

select ok(
  not has_function_privilege('anon', 'public.record_invite_resent(uuid, text, uuid)', 'EXECUTE'),
  'anon cannot execute record_invite_resent'
);

select ok(
  not has_function_privilege('anon', 'public.create_key(text, public.zone, text, uuid, integer)', 'EXECUTE'),
  'anon cannot execute create_key'
);

select ok(
  has_function_privilege('authenticated', 'public.reinstate_user(uuid, text, uuid)', 'EXECUTE'),
  'authenticated can execute reinstate_user (the route calls it with the CSO''s session)'
);

select ok(
  has_function_privilege('authenticated', 'public.record_invite_resent(uuid, text, uuid)', 'EXECUTE'),
  'authenticated can execute record_invite_resent'
);

select ok(
  has_function_privilege('authenticated', 'public.create_key(text, public.zone, text, uuid, integer)', 'EXECUTE'),
  'authenticated can execute create_key'
);

-- ---------------------------------------------------------------------------
-- The direct-insert policies are gone
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and tablename = 'incidents' and cmd = 'INSERT'),
  0,
  'incidents has no INSERT policy (incidents_insert_cso_verifier is dropped)'
);

select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and tablename = 'keys' and cmd = 'INSERT'),
  0,
  'keys has no INSERT policy (keys_insert_cso is dropped)'
);

-- Still the CSO's claims from above.
set local role authenticated;

do $$
begin
  begin
    insert into public.incidents (
      reference, logged_by, type, severity, description, status, occurred_at
    ) values (
      'INC-PGTAP-1601', '16161616-1616-4161-8161-000000000001',
      'OTHER', 'LOW', 'Direct insert', 'OPEN', now()
    );
    perform set_config('pgtap.cso_incident_insert', 'OK', true);
  exception when others then
    perform set_config('pgtap.cso_incident_insert', 'ERR:' || SQLSTATE, true);
  end;

  begin
    insert into public.keys (code, zone, room_name, unit_id, key_count, status)
    values ('PGK-1602', 'NEW_SENATE', 'Direct Room', '16161616-1616-4161-8161-000000000010', 1, 'AVAILABLE');
    perform set_config('pgtap.cso_key_insert', 'OK', true);
  exception when others then
    perform set_config('pgtap.cso_key_insert', 'ERR:' || SQLSTATE, true);
  end;
end;
$$;

reset role;

select is(
  current_setting('pgtap.cso_incident_insert'),
  'ERR:42501',
  'an authenticated CSO cannot insert an incident directly — log_incident only'
);

select is(
  current_setting('pgtap.cso_key_insert'),
  'ERR:42501',
  'an authenticated CSO cannot insert a key directly — create_key only'
);

select * from finish();
rollback;
