-- ---------------------------------------------------------------------------
-- 15 — mark_key_lost and log_incident
--
-- POST /api/keys/mark-lost retired the key and inserted its incident as two
-- separate writes and wrote no audit entry; POST /api/incidents inserted with
-- no audit entry. Both are now RPCs that commit the state change and the
-- audit entry together. Both read the actor from auth.uid(), so the caller is
-- set through request.jwt.claims rather than a parameter (same as 12/13).
-- ---------------------------------------------------------------------------

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions;

select plan(29);

insert into auth.users (id, email) values
  ('15151515-1515-4151-8151-000000000001', 'pgtap.incident.cso@example.test'),
  ('15151515-1515-4151-8151-000000000002', 'pgtap.incident.verifier@example.test'),
  ('15151515-1515-4151-8151-000000000003', 'pgtap.incident.dean@example.test'),
  ('15151515-1515-4151-8151-000000000004', 'pgtap.incident.requester@example.test');

insert into public.units (id, name, faculty, authoriser) values
  ('15151515-1515-4151-8151-000000000010', 'pgTAP Faculty of Incidents', 'pgTAP Faculty of Incidents', 'DEAN');

insert into public.profiles (id, role, full_name, institutional_email, unit_id, status) values
  ('15151515-1515-4151-8151-000000000001', 'CSO',       'pgTAP Incident CSO',       'pgtap.incident.cso@example.test',       null,                                    'ACTIVE'),
  ('15151515-1515-4151-8151-000000000002', 'VERIFIER',  'pgTAP Incident Verifier',  'pgtap.incident.verifier@example.test',  null,                                    'ACTIVE'),
  ('15151515-1515-4151-8151-000000000003', 'DEAN',      'pgTAP Incident Dean',      'pgtap.incident.dean@example.test',      '15151515-1515-4151-8151-000000000010', 'ACTIVE'),
  ('15151515-1515-4151-8151-000000000004', 'REQUESTER', 'pgTAP Incident Requester', 'pgtap.incident.requester@example.test', '15151515-1515-4151-8151-000000000010', 'ACTIVE');

insert into public.keys (id, code, zone, room_name, unit_id, status, retired_at) values
  ('15151515-1515-4151-8151-000000000020', 'PGL-1501', 'NEW_SENATE', 'pgTAP Lost Room A',    '15151515-1515-4151-8151-000000000010', 'ISSUED',    null),
  ('15151515-1515-4151-8151-000000000021', 'PGL-1502', 'NEW_SENATE', 'pgTAP Retired Room B', '15151515-1515-4151-8151-000000000010', 'RETIRED',   now() - interval '1 day'),
  ('15151515-1515-4151-8151-000000000022', 'PGL-1503', 'NEW_SENATE', 'pgTAP Spare Room C',   '15151515-1515-4151-8151-000000000010', 'AVAILABLE', null);

-- Key ...0020 has one copy out (KEY_ISSUED) and one lapsed code, which does
-- not occupy a copy: open_requests must count 1, not 2.
insert into public.requests
  (id, requester_id, key_id, type, requested_for, status, code, code_expires_at, return_deadline)
values
  ('15151515-1515-4151-8151-000000000040', '15151515-1515-4151-8151-000000000004', '15151515-1515-4151-8151-000000000020', 'WEEKDAY', current_date, 'KEY_ISSUED',  null,     null,                           now() + interval '1 day'),
  ('15151515-1515-4151-8151-000000000041', '15151515-1515-4151-8151-000000000004', '15151515-1515-4151-8151-000000000020', 'WEEKDAY', current_date, 'CODE_ISSUED', '151515', now() - interval '5 minutes', now() + interval '1 day');

insert into public.shifts (id, shift_number, started_at, ended_at, primary_officer_id) values
  ('15151515-1515-4151-8151-000000000030', 1, now() - interval '1 hour', null, '15151515-1515-4151-8151-000000000002');

-- ---------------------------------------------------------------------------
-- mark_key_lost
-- ---------------------------------------------------------------------------

do $$
begin
  perform set_config('request.jwt.claims', '{}', true);
end;
$$;

select throws_ok(
  $$ select * from public.mark_key_lost('15151515-1515-4151-8151-000000000022', 'x') $$,
  'P0001',
  'NOT_AUTHENTICATED',
  'mark_key_lost refuses a call with no session'
);

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '15151515-1515-4151-8151-000000000004', 'role', 'authenticated')::text, true);
end;
$$;

select throws_ok(
  $$ select * from public.mark_key_lost('15151515-1515-4151-8151-000000000022', 'x') $$,
  'P0002',
  'FORBIDDEN: only the CSO can mark a key lost',
  'mark_key_lost refuses a requester'
);

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '15151515-1515-4151-8151-000000000003', 'role', 'authenticated')::text, true);
end;
$$;

select throws_ok(
  $$ select * from public.mark_key_lost('15151515-1515-4151-8151-000000000022', 'x') $$,
  'P0002',
  'FORBIDDEN: only the CSO can mark a key lost',
  'mark_key_lost refuses a Dean'
);

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '15151515-1515-4151-8151-000000000002', 'role', 'authenticated')::text, true);
end;
$$;

select throws_ok(
  $$ select * from public.mark_key_lost('15151515-1515-4151-8151-000000000022', 'x') $$,
  'P0002',
  'FORBIDDEN: only the CSO can mark a key lost',
  'mark_key_lost refuses a verifier'
);

select is(
  (select status::text from public.keys where id = '15151515-1515-4151-8151-000000000022'),
  'AVAILABLE',
  'a refused mark_key_lost leaves the key untouched'
);

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '15151515-1515-4151-8151-000000000001', 'role', 'authenticated')::text, true);
end;
$$;

select throws_ok(
  $$ select * from public.mark_key_lost('15151515-1515-4151-8151-000000000022', '   ') $$,
  'P0004',
  'VALIDATION: a note is required',
  'mark_key_lost refuses a blank note'
);

select throws_ok(
  $$ select * from public.mark_key_lost('15151515-1515-4151-8151-0000000000ff', 'Gone') $$,
  'P0007',
  'NOT_FOUND: key 15151515-1515-4151-8151-0000000000ff does not exist',
  'mark_key_lost refuses an unknown key'
);

select throws_ok(
  $$ select * from public.mark_key_lost('15151515-1515-4151-8151-000000000021', 'Gone') $$,
  'P0006',
  'CONFLICT: key is already retired',
  'mark_key_lost refuses a key that is already retired'
);

select is(
  (select count(*)::int from public.audit_log
   where event = 'KEY_MARKED_LOST'
     and target_id in ('15151515-1515-4151-8151-000000000021',
                       '15151515-1515-4151-8151-000000000022')),
  0,
  'no KEY_MARKED_LOST entry is written for a refused call'
);

create temp table t_ml as
select * from public.mark_key_lost('15151515-1515-4151-8151-000000000020', 'Not returned after audit');

select is(
  (select key_id from t_ml),
  '15151515-1515-4151-8151-000000000020'::uuid,
  'mark_key_lost answers the key id'
);

select is(
  (select status::text from public.keys where id = '15151515-1515-4151-8151-000000000020'),
  'RETIRED',
  'the key is retired'
);

select ok(
  (select retired_at is not null from public.keys where id = '15151515-1515-4151-8151-000000000020'),
  'retired_at is set'
);

select is(
  (select count(*)::int from public.incidents i, t_ml
   where i.id = t_ml.incident_id
     and i.reference = t_ml.reference
     and i.type = 'MISSING_KEY'
     and i.severity = 'HIGH'
     and i.status = 'OPEN'
     and i.description = 'Not returned after audit'
     and i.related_key_id = '15151515-1515-4151-8151-000000000020'
     and i.logged_by = '15151515-1515-4151-8151-000000000001'),
  1,
  'a HIGH MISSING_KEY incident is logged against the key by the CSO'
);

select is(
  (select i.shift_id from public.incidents i, t_ml where i.id = t_ml.incident_id),
  (select s.id from public.shifts s where s.ended_at is null order by s.started_at desc limit 1),
  'the incident is filed against the open shift'
);

select is(
  (select count(*)::int from public.audit_log
   where event = 'KEY_MARKED_LOST'
     and target_id = '15151515-1515-4151-8151-000000000020'),
  1,
  'exactly one KEY_MARKED_LOST entry commits with the retirement'
);

select is(
  (select count(*)::int from public.audit_log a, t_ml
   where a.event = 'KEY_MARKED_LOST'
     and a.target_type = 'key'
     and a.target_id = '15151515-1515-4151-8151-000000000020'
     and a.actor_id = '15151515-1515-4151-8151-000000000001'
     and a.actor_role = 'CSO'
     and a.payload->>'key_id' = '15151515-1515-4151-8151-000000000020'
     and a.payload->>'key_code' = 'PGL-1501'
     and a.payload->>'incident_id' = t_ml.incident_id::text
     and a.payload->>'incident_reference' = t_ml.reference
     and a.payload->>'note' = 'Not returned after audit'
     and (a.payload->>'open_requests')::int = 1),
  1,
  'the entry names the key, the incident, the note and the one copy still out'
);

-- ---------------------------------------------------------------------------
-- log_incident
-- ---------------------------------------------------------------------------

do $$
begin
  perform set_config('request.jwt.claims', '{}', true);
end;
$$;

select throws_ok(
  $$ select * from public.log_incident('OTHER', 'LOW', 'x', now()) $$,
  'P0001',
  'NOT_AUTHENTICATED',
  'log_incident refuses a call with no session'
);

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '15151515-1515-4151-8151-000000000004', 'role', 'authenticated')::text, true);
end;
$$;

select throws_ok(
  $$ select * from public.log_incident('OTHER', 'LOW', 'x', now()) $$,
  'P0002',
  'FORBIDDEN: only the CSO or a verifier can log an incident',
  'log_incident refuses a requester'
);

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '15151515-1515-4151-8151-000000000003', 'role', 'authenticated')::text, true);
end;
$$;

select throws_ok(
  $$ select * from public.log_incident('OTHER', 'LOW', 'x', now()) $$,
  'P0002',
  'FORBIDDEN: only the CSO or a verifier can log an incident',
  'log_incident refuses a Dean'
);

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '15151515-1515-4151-8151-000000000002', 'role', 'authenticated')::text, true);
end;
$$;

select throws_ok(
  $$ select * from public.log_incident('OTHER', 'LOW', '   ', now()) $$,
  'P0004',
  'VALIDATION: type, severity, description and occurred_at are required',
  'log_incident refuses a blank description'
);

create temp table t_li as
select * from public.log_incident(
  'SUSPICIOUS_ACTIVITY', 'MEDIUM', 'Door propped open',
  now() - interval '10 minutes',
  '15151515-1515-4151-8151-000000000022',
  '15151515-1515-4151-8151-000000000004'
);

select is(
  (select count(*)::int from public.incidents i, t_li
   where i.id = t_li.incident_id
     and i.reference = t_li.reference
     and i.type = 'SUSPICIOUS_ACTIVITY'
     and i.severity = 'MEDIUM'
     and i.status = 'OPEN'
     and i.description = 'Door propped open'
     and i.related_key_id = '15151515-1515-4151-8151-000000000022'
     and i.related_person_id = '15151515-1515-4151-8151-000000000004'
     and i.logged_by = '15151515-1515-4151-8151-000000000002'),
  1,
  'a verifier can log an incident, recorded as the session user'
);

select matches(
  (select reference from t_li),
  '^INC-[0-9]{4}-[0-9]{4,}$',
  'the DB generates the incident reference'
);

select is(
  (select i.shift_id from public.incidents i, t_li where i.id = t_li.incident_id),
  (select s.id from public.shifts s where s.ended_at is null order by s.started_at desc limit 1),
  'the incident is filed against the open shift'
);

select is(
  (select count(*)::int from public.audit_log a, t_li
   where a.event = 'INCIDENT_LOGGED'
     and a.target_type = 'incident'
     and a.target_id = t_li.incident_id
     and a.actor_id = '15151515-1515-4151-8151-000000000002'
     and a.actor_role = 'VERIFIER'
     and a.payload->>'incident_id' = t_li.incident_id::text
     and a.payload->>'reference' = t_li.reference
     and a.payload->>'type' = 'SUSPICIOUS_ACTIVITY'
     and a.payload->>'severity' = 'MEDIUM'
     and a.payload->>'related_key_id' = '15151515-1515-4151-8151-000000000022'
     and a.payload->>'related_person_id' = '15151515-1515-4151-8151-000000000004'),
  1,
  'exactly one INCIDENT_LOGGED entry commits with the incident'
);

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '15151515-1515-4151-8151-000000000001', 'role', 'authenticated')::text, true);
end;
$$;

create temp table t_li_cso as
select * from public.log_incident('EQUIPMENT_FAULT', 'LOW', 'Key cabinet hinge loose', now());

select is(
  (select count(*)::int from public.audit_log a, t_li_cso
   where a.event = 'INCIDENT_LOGGED'
     and a.target_id = t_li_cso.incident_id
     and a.actor_role = 'CSO'
     and a.payload->'related_key_id' = 'null'::jsonb),
  1,
  'the CSO can log an incident too, with no related key'
);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.mark_key_lost(uuid, text)', 'EXECUTE'),
  'anon cannot execute mark_key_lost'
);

select ok(
  not has_function_privilege('anon',
    'public.log_incident(public.incident_type, public.incident_severity, text, timestamptz, uuid, uuid)',
    'EXECUTE'),
  'anon cannot execute log_incident'
);

select ok(
  has_function_privilege('authenticated', 'public.mark_key_lost(uuid, text)', 'EXECUTE'),
  'authenticated can execute mark_key_lost (the route calls it with the CSO''s session)'
);

select ok(
  has_function_privilege('authenticated',
    'public.log_incident(public.incident_type, public.incident_severity, text, timestamptz, uuid, uuid)',
    'EXECUTE'),
  'authenticated can execute log_incident'
);

select * from finish();
rollback;
