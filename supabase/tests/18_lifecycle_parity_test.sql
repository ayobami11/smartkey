-- ---------------------------------------------------------------------------
-- 18 — Guest and registered lifecycle steps behave identically
--
-- 20261019090000_merge_guest_registered_lifecycle.sql gave each request-
-- lifecycle step one implementation, with the registered and guest RPCs as
-- thin wrappers around it:
--
--   weekend code  generate_weekend_code / generate_guest_weekend_code
--                 -> _lifecycle_weekend_code
--   return code   request_return / request_return_guest
--                 -> _lifecycle_return_code
--   expire        expire_request / expire_guest_request
--                 -> _lifecycle_expire_code
--
-- For every state each step distinguishes, this file builds one registered
-- and one guest request in that state, drives each through its own public
-- RPC, and asserts the two came out the same: the same error kind and
-- SQLSTATE, the same transition, and exactly one audit entry each with the
-- same event and payload (the guest's carrying `external: true` and the plain
-- guest name). Before the merge the return-code pair disagreed on the error
-- kind (NOT_ISSUED vs CONFLICT) and the guest audit name carried a stray
-- " (external)" suffix on two of the three steps.
--
-- Each pair of calls is compared in one assertion as a two-element array
-- against the expected pair, so a failure shows both sides.
--
-- Everything runs inside one transaction and is rolled back at the end.
-- ---------------------------------------------------------------------------

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions;

select plan(35);

-- Runs one statement and reports 'OK', or '<SQLSTATE> <KIND>' for a raised
-- error. The exception block rolls the failed call back on its own.
create function pg_temp.outcome(p_sql text)
returns text
language plpgsql
as $$
begin
  execute p_sql;
  return 'OK';
exception when others then
  return sqlstate || ' ' || split_part(sqlerrm, ':', 1);
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('18181818-1818-4181-8181-000000000001', 'pgtap.parity.requester@example.test'),
  ('18181818-1818-4181-8181-000000000002', 'pgtap.parity.occupant@example.test');

insert into public.units (id, name, faculty, authoriser) values
  ('18181818-1818-4181-8181-000000000010', 'pgTAP Parity Faculty', 'pgTAP Parity Faculty', 'DEAN');

insert into public.profiles (id, role, full_name, institutional_email, unit_id, status) values
  ('18181818-1818-4181-8181-000000000001', 'REQUESTER', 'pgTAP Parity Requester', 'pgtap.parity.requester@example.test', '18181818-1818-4181-8181-000000000010', 'ACTIVE'),
  ('18181818-1818-4181-8181-000000000002', 'REQUESTER', 'pgTAP Parity Occupant',  'pgtap.parity.occupant@example.test',  '18181818-1818-4181-8181-000000000010', 'ACTIVE');

-- K1 has copies to spare; K2 has one, already out, for the capacity case.
insert into public.keys (id, code, zone, room_name, unit_id, status, key_count) values
  ('18181818-1818-4181-8181-000000000020', 'PGT-1801', 'NEW_SENATE', 'pgTAP Parity Office', '18181818-1818-4181-8181-000000000010', 'AVAILABLE', 20),
  ('18181818-1818-4181-8181-000000000021', 'PGT-1802', 'NEW_SENATE', 'pgTAP Parity Store',  '18181818-1818-4181-8181-000000000010', 'ISSUED',    1);

insert into public.guest_requesters (id, full_name, email, id_document_type, id_document_number) values
  ('18181818-1818-4181-8181-000000000030', 'pgTAP Parity Guest', 'pgtap.parity.guest@example.test', 'National ID', 'PGT-ID-1801');

-- Registered requests are 1xx; their guest twins are 2xx with access_token
-- 18181818-aaaa-4aaa-8aaa-0000000002xx.
insert into public.requests
  (id, requester_id, guest_id, requested_unit_id, key_id, type, requested_for, status, code, code_expires_at, return_deadline, access_token)
values
  -- K2's only copy, held by someone else.
  ('18181818-1818-4181-8181-000000000100', '18181818-1818-4181-8181-000000000002', null, null, '18181818-1818-4181-8181-000000000021', 'WEEKDAY', current_date, 'KEY_ISSUED', null, null, now() + interval '1 day', null),

  -- Weekend code
  -- W1: APPROVED for today — mints.
  ('18181818-1818-4181-8181-000000000101', '18181818-1818-4181-8181-000000000001', null, null, '18181818-1818-4181-8181-000000000020', 'WEEKEND', current_date,     'APPROVED',    null, null, now() + interval '1 day',  null),
  ('18181818-1818-4181-8181-000000000201', null, '18181818-1818-4181-8181-000000000030', '18181818-1818-4181-8181-000000000010', '18181818-1818-4181-8181-000000000020', 'WEEKEND', current_date,     'APPROVED',    null, null, now() + interval '1 day',  '18181818-aaaa-4aaa-8aaa-000000000201'),
  -- W2: still PENDING_HOD.
  ('18181818-1818-4181-8181-000000000102', '18181818-1818-4181-8181-000000000001', null, null, '18181818-1818-4181-8181-000000000020', 'WEEKEND', current_date,     'PENDING_HOD', null, null, now() + interval '1 day',  null),
  ('18181818-1818-4181-8181-000000000202', null, '18181818-1818-4181-8181-000000000030', '18181818-1818-4181-8181-000000000010', '18181818-1818-4181-8181-000000000020', 'WEEKEND', current_date,     'PENDING_HOD', null, null, now() + interval '1 day',  '18181818-aaaa-4aaa-8aaa-000000000202'),
  -- W3: APPROVED for a later date.
  ('18181818-1818-4181-8181-000000000103', '18181818-1818-4181-8181-000000000001', null, null, '18181818-1818-4181-8181-000000000020', 'WEEKEND', current_date + 3, 'APPROVED',    null, null, now() + interval '3 days', null),
  ('18181818-1818-4181-8181-000000000203', null, '18181818-1818-4181-8181-000000000030', '18181818-1818-4181-8181-000000000010', '18181818-1818-4181-8181-000000000020', 'WEEKEND', current_date + 3, 'APPROVED',    null, null, now() + interval '3 days', '18181818-aaaa-4aaa-8aaa-000000000203'),
  -- W4: APPROVED for today on K2, whose only copy is out.
  ('18181818-1818-4181-8181-000000000104', '18181818-1818-4181-8181-000000000001', null, null, '18181818-1818-4181-8181-000000000021', 'WEEKEND', current_date,     'APPROVED',    null, null, now() + interval '1 day',  null),
  ('18181818-1818-4181-8181-000000000204', null, '18181818-1818-4181-8181-000000000030', '18181818-1818-4181-8181-000000000010', '18181818-1818-4181-8181-000000000021', 'WEEKEND', current_date,     'APPROVED',    null, null, now() + interval '1 day',  '18181818-aaaa-4aaa-8aaa-000000000204'),

  -- Return code
  -- R1: KEY_ISSUED — mints.
  ('18181818-1818-4181-8181-000000000111', '18181818-1818-4181-8181-000000000001', null, null, '18181818-1818-4181-8181-000000000020', 'WEEKEND', current_date,     'KEY_ISSUED',  null,     null,                         now() + interval '1 day',  null),
  ('18181818-1818-4181-8181-000000000211', null, '18181818-1818-4181-8181-000000000030', '18181818-1818-4181-8181-000000000010', '18181818-1818-4181-8181-000000000020', 'WEEKEND', current_date,     'KEY_ISSUED',  null,     null,                         now() + interval '1 day',  '18181818-aaaa-4aaa-8aaa-000000000211'),
  -- R2: CODE_ISSUED — not yet collected.
  ('18181818-1818-4181-8181-000000000112', '18181818-1818-4181-8181-000000000001', null, null, '18181818-1818-4181-8181-000000000020', 'WEEKEND', current_date,     'CODE_ISSUED', '181112', now() + interval '5 minutes', now() + interval '1 day',  null),
  ('18181818-1818-4181-8181-000000000212', null, '18181818-1818-4181-8181-000000000030', '18181818-1818-4181-8181-000000000010', '18181818-1818-4181-8181-000000000020', 'WEEKEND', current_date,     'CODE_ISSUED', '181212', now() + interval '5 minutes', now() + interval '1 day',  '18181818-aaaa-4aaa-8aaa-000000000212'),

  -- Expire
  -- E1: lapsed weekend code for today — rolls back to APPROVED.
  ('18181818-1818-4181-8181-000000000121', '18181818-1818-4181-8181-000000000001', null, null, '18181818-1818-4181-8181-000000000020', 'WEEKEND', current_date,     'CODE_ISSUED', '181121', now() - interval '1 minute',  now() + interval '1 day',  null),
  ('18181818-1818-4181-8181-000000000221', null, '18181818-1818-4181-8181-000000000030', '18181818-1818-4181-8181-000000000010', '18181818-1818-4181-8181-000000000020', 'WEEKEND', current_date,     'CODE_ISSUED', '181221', now() - interval '1 minute',  now() + interval '1 day',  '18181818-aaaa-4aaa-8aaa-000000000221'),
  -- E2: lapsed code, not for today — terminal EXPIRED.
  ('18181818-1818-4181-8181-000000000122', '18181818-1818-4181-8181-000000000001', null, null, '18181818-1818-4181-8181-000000000020', 'WEEKEND', current_date + 2, 'CODE_ISSUED', '181122', now() - interval '1 minute',  now() + interval '2 days', null),
  ('18181818-1818-4181-8181-000000000222', null, '18181818-1818-4181-8181-000000000030', '18181818-1818-4181-8181-000000000010', '18181818-1818-4181-8181-000000000020', 'WEEKEND', current_date + 2, 'CODE_ISSUED', '181222', now() - interval '1 minute',  now() + interval '2 days', '18181818-aaaa-4aaa-8aaa-000000000222'),
  -- E3: code still live.
  ('18181818-1818-4181-8181-000000000123', '18181818-1818-4181-8181-000000000001', null, null, '18181818-1818-4181-8181-000000000020', 'WEEKEND', current_date + 2, 'CODE_ISSUED', '181123', now() + interval '5 minutes', now() + interval '2 days', null),
  ('18181818-1818-4181-8181-000000000223', null, '18181818-1818-4181-8181-000000000030', '18181818-1818-4181-8181-000000000010', '18181818-1818-4181-8181-000000000020', 'WEEKEND', current_date + 2, 'CODE_ISSUED', '181223', now() + interval '5 minutes', now() + interval '2 days', '18181818-aaaa-4aaa-8aaa-000000000223'),
  -- E4: already moved on (no code at all).
  ('18181818-1818-4181-8181-000000000124', '18181818-1818-4181-8181-000000000001', null, null, '18181818-1818-4181-8181-000000000020', 'WEEKEND', current_date + 2, 'APPROVED',    null,     null,                         now() + interval '2 days', null),
  ('18181818-1818-4181-8181-000000000224', null, '18181818-1818-4181-8181-000000000030', '18181818-1818-4181-8181-000000000010', '18181818-1818-4181-8181-000000000020', 'WEEKEND', current_date + 2, 'APPROVED',    null,     null,                         now() + interval '2 days', '18181818-aaaa-4aaa-8aaa-000000000224');

-- The registered path runs as the requester's session.
do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '18181818-1818-4181-8181-000000000001', 'role', 'authenticated')::text, true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: the steps are internal; the wrappers keep their grants
-- ---------------------------------------------------------------------------

select ok(
  not exists (
    select 1
    from (values
      ('public._resolve_guest_request(uuid)'),
      ('public._lock_lifecycle_request(uuid, uuid)'),
      ('public._write_lifecycle_audit(text, uuid, uuid, uuid, jsonb)'),
      ('public._lifecycle_weekend_code(uuid, uuid)'),
      ('public._lifecycle_return_code(uuid, uuid)'),
      ('public._lifecycle_expire_code(uuid, uuid)')
    ) f(sig)
    cross join (values ('anon'), ('authenticated'), ('service_role')) r(role)
    where has_function_privilege(r.role, f.sig, 'EXECUTE')
  ),
  'no API role can execute the internal lifecycle functions'
);

select ok(
  not exists (
    select 1
    from (values
      ('public.generate_guest_weekend_code(uuid)'),
      ('public.request_return_guest(uuid)'),
      ('public.expire_guest_request(uuid)')
    ) f(sig)
    where not has_function_privilege('service_role', f.sig, 'EXECUTE')
       or has_function_privilege('authenticated', f.sig, 'EXECUTE')
       or has_function_privilege('anon', f.sig, 'EXECUTE')
  ),
  'the guest RPCs stay executable by service_role only'
);

select ok(
  not exists (
    select 1
    from (values
      ('public.generate_weekend_code(uuid, uuid)'),
      ('public.request_return(uuid, uuid)'),
      ('public.expire_request(uuid, uuid)')
    ) f(sig)
    where not has_function_privilege('authenticated', f.sig, 'EXECUTE')
       or not has_function_privilege('service_role', f.sig, 'EXECUTE')
       or has_function_privilege('anon', f.sig, 'EXECUTE')
  ),
  'the registered RPCs stay executable by authenticated and service_role, not anon'
);

-- ---------------------------------------------------------------------------
-- Weekend code
-- ---------------------------------------------------------------------------

select is(
  array[
    pg_temp.outcome($$ select * from public.generate_weekend_code('18181818-1818-4181-8181-000000000101', '18181818-1818-4181-8181-000000000001') $$),
    pg_temp.outcome($$ select * from public.generate_guest_weekend_code('18181818-aaaa-4aaa-8aaa-000000000201') $$)
  ],
  array['OK', 'OK'],
  'weekend code, APPROVED for today: both paths mint'
);

select is(
  array(select status::text from public.requests
        where id in ('18181818-1818-4181-8181-000000000101', '18181818-1818-4181-8181-000000000201')
        order by id),
  array['CODE_ISSUED', 'CODE_ISSUED'],
  'weekend code: both requests move to CODE_ISSUED'
);

select is(
  (select count(*)::int from public.requests
   where id in ('18181818-1818-4181-8181-000000000101', '18181818-1818-4181-8181-000000000201')
     and code ~ '^[0-9]{6}$'
     and code_expires_at between now() + interval '9 minutes' and now() + interval '11 minutes'),
  2,
  'weekend code: both get a 6-digit code on the configured expiry (default 10 minutes)'
);

select is(
  array[
    (select count(*)::int from public.audit_log where event = 'CODE_ISSUED' and target_id = '18181818-1818-4181-8181-000000000101'),
    (select count(*)::int from public.audit_log where event = 'CODE_ISSUED' and target_id = '18181818-1818-4181-8181-000000000201')
  ],
  array[1, 1],
  'weekend code: exactly one CODE_ISSUED entry each'
);

select is(
  (select payload from public.audit_log where event = 'CODE_ISSUED' and target_id = '18181818-1818-4181-8181-000000000101'),
  (select payload - 'external' from public.audit_log where event = 'CODE_ISSUED' and target_id = '18181818-1818-4181-8181-000000000201'),
  'weekend code: the two payloads match apart from the guest''s external flag'
);

select ok(
  exists (select 1 from public.audit_log
          where event = 'CODE_ISSUED' and target_id = '18181818-1818-4181-8181-000000000101'
            and actor_id = '18181818-1818-4181-8181-000000000001' and actor_role = 'REQUESTER')
  and exists (select 1 from public.audit_log
              where event = 'CODE_ISSUED' and target_id = '18181818-1818-4181-8181-000000000201'
                and actor_id is null and actor_name = 'pgTAP Parity Guest'
                and payload->>'external' = 'true'),
  'weekend code: registered entry names the requester, guest entry the plain guest name with external'
);

select is(
  array[
    pg_temp.outcome($$ select * from public.generate_weekend_code('18181818-1818-4181-8181-000000000102', '18181818-1818-4181-8181-000000000001') $$),
    pg_temp.outcome($$ select * from public.generate_guest_weekend_code('18181818-aaaa-4aaa-8aaa-000000000202') $$)
  ],
  array['P0006 CONFLICT', 'P0006 CONFLICT'],
  'weekend code, PENDING_HOD: both paths raise CONFLICT'
);

select is(
  array[
    pg_temp.outcome($$ select * from public.generate_weekend_code('18181818-1818-4181-8181-000000000103', '18181818-1818-4181-8181-000000000001') $$),
    pg_temp.outcome($$ select * from public.generate_guest_weekend_code('18181818-aaaa-4aaa-8aaa-000000000203') $$)
  ],
  array['P0014 TOO_EARLY', 'P0014 TOO_EARLY'],
  'weekend code, APPROVED for a later date: both paths raise TOO_EARLY'
);

select is(
  array[
    pg_temp.outcome($$ select * from public.generate_weekend_code('18181818-1818-4181-8181-000000000104', '18181818-1818-4181-8181-000000000001') $$),
    pg_temp.outcome($$ select * from public.generate_guest_weekend_code('18181818-aaaa-4aaa-8aaa-000000000204') $$)
  ],
  array['P0016 NO_KEYS_AVAILABLE', 'P0016 NO_KEYS_AVAILABLE'],
  'weekend code, every copy out: both paths raise NO_KEYS_AVAILABLE'
);

select is(
  array[
    pg_temp.outcome($$ select * from public.generate_weekend_code('18181818-1818-4181-8181-0000000001ff', '18181818-1818-4181-8181-000000000001') $$),
    pg_temp.outcome($$ select * from public.generate_guest_weekend_code('18181818-aaaa-4aaa-8aaa-0000000002ff') $$)
  ],
  array['P0007 NOT_FOUND', 'P0007 NOT_FOUND'],
  'weekend code, unknown request or token: both paths raise NOT_FOUND'
);

select is(
  (select count(*)::int from public.audit_log
   where target_id in ('18181818-1818-4181-8181-000000000102', '18181818-1818-4181-8181-000000000202',
                       '18181818-1818-4181-8181-000000000103', '18181818-1818-4181-8181-000000000203',
                       '18181818-1818-4181-8181-000000000104', '18181818-1818-4181-8181-000000000204')),
  0,
  'weekend code: no refused attempt wrote an audit entry'
);

select is(
  array(select status::text from public.requests
        where id in ('18181818-1818-4181-8181-000000000102', '18181818-1818-4181-8181-000000000202',
                     '18181818-1818-4181-8181-000000000103', '18181818-1818-4181-8181-000000000203',
                     '18181818-1818-4181-8181-000000000104', '18181818-1818-4181-8181-000000000204')
        order by id),
  array['PENDING_HOD', 'APPROVED', 'APPROVED', 'PENDING_HOD', 'APPROVED', 'APPROVED'],
  'weekend code: no refused attempt changed a status'
);

-- ---------------------------------------------------------------------------
-- Return code
-- ---------------------------------------------------------------------------

select is(
  array[
    pg_temp.outcome($$ select * from public.request_return('18181818-1818-4181-8181-000000000111', '18181818-1818-4181-8181-000000000001') $$),
    pg_temp.outcome($$ select * from public.request_return_guest('18181818-aaaa-4aaa-8aaa-000000000211') $$)
  ],
  array['OK', 'OK'],
  'return code, KEY_ISSUED: both paths mint'
);

select is(
  (select count(*)::int from public.requests
   where id in ('18181818-1818-4181-8181-000000000111', '18181818-1818-4181-8181-000000000211')
     and status = 'KEY_ISSUED'
     and return_code ~ '^[0-9]{6}$'
     and return_code_expires_at between now() + interval '14 minutes' and now() + interval '16 minutes'),
  2,
  'return code: both stay KEY_ISSUED with a 6-digit code expiring in 15 minutes'
);

select is(
  array[
    (select count(*)::int from public.audit_log where event = 'RETURN_CODE_GENERATED' and target_id = '18181818-1818-4181-8181-000000000111'),
    (select count(*)::int from public.audit_log where event = 'RETURN_CODE_GENERATED' and target_id = '18181818-1818-4181-8181-000000000211')
  ],
  array[1, 1],
  'return code: exactly one RETURN_CODE_GENERATED entry each'
);

select is(
  (select payload - 'expires_at' from public.audit_log where event = 'RETURN_CODE_GENERATED' and target_id = '18181818-1818-4181-8181-000000000111'),
  (select payload - 'expires_at' - 'external' from public.audit_log where event = 'RETURN_CODE_GENERATED' and target_id = '18181818-1818-4181-8181-000000000211'),
  'return code: the two payloads carry the same fields (expires_at differs by clock only)'
);

select ok(
  exists (select 1 from public.audit_log
          where event = 'RETURN_CODE_GENERATED' and target_id = '18181818-1818-4181-8181-000000000111'
            and actor_id = '18181818-1818-4181-8181-000000000001' and actor_role = 'REQUESTER'
            and payload ? 'expires_at')
  and exists (select 1 from public.audit_log
              where event = 'RETURN_CODE_GENERATED' and target_id = '18181818-1818-4181-8181-000000000211'
                and actor_id is null and actor_name = 'pgTAP Parity Guest'
                and payload->>'external' = 'true' and payload ? 'expires_at'),
  'return code: guest entry carries the plain guest name, no " (external)" suffix'
);

select is(
  array[
    pg_temp.outcome($$ select * from public.request_return('18181818-1818-4181-8181-000000000112', '18181818-1818-4181-8181-000000000001') $$),
    pg_temp.outcome($$ select * from public.request_return_guest('18181818-aaaa-4aaa-8aaa-000000000212') $$)
  ],
  array['P0009 NOT_ISSUED', 'P0009 NOT_ISSUED'],
  'return code, not yet collected: both paths raise NOT_ISSUED (the guest path raised CONFLICT before)'
);

select is(
  (select count(*)::int from public.audit_log
   where target_id in ('18181818-1818-4181-8181-000000000112', '18181818-1818-4181-8181-000000000212'))
  + (select count(*)::int from public.requests
     where id in ('18181818-1818-4181-8181-000000000112', '18181818-1818-4181-8181-000000000212')
       and return_code is not null),
  0,
  'return code: the refused attempts wrote no audit entry and no code'
);

-- ---------------------------------------------------------------------------
-- Expire
-- ---------------------------------------------------------------------------

select is(
  array[
    (select status from public.expire_request('18181818-1818-4181-8181-000000000121', '18181818-1818-4181-8181-000000000001')),
    (select status from public.expire_guest_request('18181818-aaaa-4aaa-8aaa-000000000221'))
  ],
  array['APPROVED', 'APPROVED'],
  'expire, lapsed code for today: both paths roll back to APPROVED'
);

select is(
  (select count(*)::int from public.requests
   where id in ('18181818-1818-4181-8181-000000000121', '18181818-1818-4181-8181-000000000221')
     and status = 'APPROVED' and code is null and code_expires_at is null),
  2,
  'expire rollback: both rows are APPROVED with the code cleared'
);

select is(
  array[
    (select count(*)::int from public.audit_log where event = 'CODE_EXPIRED' and target_id = '18181818-1818-4181-8181-000000000121'),
    (select count(*)::int from public.audit_log where event = 'CODE_EXPIRED' and target_id = '18181818-1818-4181-8181-000000000221'),
    (select count(*)::int from public.audit_log where event = 'REQUEST_EXPIRED'
       and target_id in ('18181818-1818-4181-8181-000000000121', '18181818-1818-4181-8181-000000000221'))
  ],
  array[1, 1, 0],
  'expire rollback: exactly one CODE_EXPIRED entry each, no REQUEST_EXPIRED'
);

select is(
  (select payload from public.audit_log where event = 'CODE_EXPIRED' and target_id = '18181818-1818-4181-8181-000000000121'),
  (select payload - 'external' from public.audit_log where event = 'CODE_EXPIRED' and target_id = '18181818-1818-4181-8181-000000000221'),
  'expire rollback: the two payloads match apart from the guest''s external flag'
);

select ok(
  exists (select 1 from public.audit_log
          where event = 'CODE_EXPIRED' and target_id = '18181818-1818-4181-8181-000000000221'
            and actor_id is null and actor_name = 'pgTAP Parity Guest'
            and payload->>'external' = 'true'),
  'expire rollback: guest entry carries the plain guest name, no " (external)" suffix'
);

select is(
  array[
    (select status from public.expire_request('18181818-1818-4181-8181-000000000122', '18181818-1818-4181-8181-000000000001')),
    (select status from public.expire_guest_request('18181818-aaaa-4aaa-8aaa-000000000222'))
  ],
  array['EXPIRED', 'EXPIRED'],
  'expire, lapsed code for a later date: both paths end in EXPIRED'
);

select is(
  array[
    (select count(*)::int from public.audit_log where event = 'REQUEST_EXPIRED' and target_id = '18181818-1818-4181-8181-000000000122'),
    (select count(*)::int from public.audit_log where event = 'REQUEST_EXPIRED' and target_id = '18181818-1818-4181-8181-000000000222')
  ],
  array[1, 1],
  'expire terminal: exactly one REQUEST_EXPIRED entry each'
);

select is(
  array[
    pg_temp.outcome($$ select * from public.expire_request('18181818-1818-4181-8181-000000000123', '18181818-1818-4181-8181-000000000001') $$),
    pg_temp.outcome($$ select * from public.expire_guest_request('18181818-aaaa-4aaa-8aaa-000000000223') $$)
  ],
  array['P0015 NOT_EXPIRED', 'P0015 NOT_EXPIRED'],
  'expire, code still live: both paths raise NOT_EXPIRED'
);

select is(
  (select count(*)::int from public.requests
   where id in ('18181818-1818-4181-8181-000000000123', '18181818-1818-4181-8181-000000000223')
     and status = 'CODE_ISSUED' and code is not null)
  - (select count(*)::int from public.audit_log
     where target_id in ('18181818-1818-4181-8181-000000000123', '18181818-1818-4181-8181-000000000223')),
  2,
  'expire, code still live: both keep their code and neither wrote an audit entry'
);

select is(
  array[
    (select status from public.expire_request('18181818-1818-4181-8181-000000000124', '18181818-1818-4181-8181-000000000001')),
    (select status from public.expire_guest_request('18181818-aaaa-4aaa-8aaa-000000000224'))
  ],
  array['APPROVED', 'APPROVED'],
  'expire, request already moved on: both paths report the current status'
);

select is(
  (select count(*)::int from public.audit_log
   where target_id in ('18181818-1818-4181-8181-000000000124', '18181818-1818-4181-8181-000000000224')),
  0,
  'expire, request already moved on: neither path wrote an audit entry'
);

-- ---------------------------------------------------------------------------
-- The actor descriptor: NULL means "the guest", and only the guest wrappers
-- may pass it
-- ---------------------------------------------------------------------------

select is(
  array[
    pg_temp.outcome($$ select * from public._lifecycle_return_code('18181818-1818-4181-8181-000000000211', '18181818-1818-4181-8181-000000000001') $$),
    pg_temp.outcome($$ select * from public._lifecycle_return_code('18181818-1818-4181-8181-000000000111', null) $$)
  ],
  array['P0010 FORBIDDEN', 'P0010 FORBIDDEN'],
  'a step refuses a registered actor on a guest request, and a guest actor on a registered one'
);

-- A trusted caller with no session (pg_cron, service_role) passes
-- _assert_session_actor whatever it names. Naming nobody must not make it
-- the guest.
do $$
begin
  perform set_config('request.jwt.claims', '{}', true);
end;
$$;

select is(
  array[
    pg_temp.outcome($$ select * from public.generate_weekend_code('18181818-1818-4181-8181-000000000203', null) $$),
    pg_temp.outcome($$ select * from public.request_return('18181818-1818-4181-8181-000000000211', null) $$),
    pg_temp.outcome($$ select * from public.expire_request('18181818-1818-4181-8181-000000000223', null) $$)
  ],
  array['P0010 FORBIDDEN', 'P0010 FORBIDDEN', 'P0010 FORBIDDEN'],
  'a registered RPC called with a NULL requester is refused, even by a trusted caller'
);

select * from finish();

rollback;
