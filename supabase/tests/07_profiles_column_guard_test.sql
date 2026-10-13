-- ---------------------------------------------------------------------------
-- 07 — profiles column guard (protect_profile_columns)
--
-- profiles_update lets a session update its own row (and the CSO any row), and
-- `authenticated` holds UPDATE on the table. Before
-- 20261013095000_profiles_column_guard.sql nothing limited WHICH columns, so a
-- requester could make themselves CSO through the REST API. From a user
-- session only full_name may change now; everything else is server-written
-- (admin client or SECURITY DEFINER RPCs).
--
-- Same pattern as 03: each write runs under `set local role authenticated`
-- inside a do-block that records each outcome in a setting, and the assertions
-- run after `reset role` (pgTAP's functions are not granted to authenticated).
-- ---------------------------------------------------------------------------

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions;

select plan(12);

insert into auth.users (id, email) values
  ('77777777-7777-4777-8777-000000000001', 'pgtap.guard.requester@example.test'),
  ('77777777-7777-4777-8777-000000000002', 'pgtap.guard.cso@example.test');

insert into public.units (id, name, faculty, authoriser) values
  ('77777777-7777-4777-8777-000000000010', 'pgTAP Guard Faculty A', 'pgTAP Guard Faculty A', 'DEAN'),
  ('77777777-7777-4777-8777-000000000011', 'pgTAP Guard Faculty B', 'pgTAP Guard Faculty B', 'DEAN');

insert into public.profiles (id, role, full_name, institutional_email, unit_id, status) values
  ('77777777-7777-4777-8777-000000000001', 'REQUESTER', 'pgTAP Guard Requester', 'pgtap.guard.requester@example.test', '77777777-7777-4777-8777-000000000010', 'ACTIVE'),
  ('77777777-7777-4777-8777-000000000002', 'CSO',       'pgTAP Guard CSO',       'pgtap.guard.cso@example.test',       null,                                    'ACTIVE');

-- ---------------------------------------------------------------------------
-- As the requester, on their own row
-- ---------------------------------------------------------------------------

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '77777777-7777-4777-8777-000000000001', 'role', 'authenticated')::text, true);
end;
$$;

set local role authenticated;

do $$
declare n int;
begin
  begin
    update public.profiles set full_name = 'Renamed Requester' where id = '77777777-7777-4777-8777-000000000001';
    get diagnostics n = row_count;
    perform set_config('pgtap.own_full_name', case when n > 0 then 'OK' else 'ROWS:0' end, true);
  exception when others then
    perform set_config('pgtap.own_full_name', 'ERR:' || SQLSTATE, true);
  end;
  begin
    update public.profiles set role = 'CSO' where id = '77777777-7777-4777-8777-000000000001';
    get diagnostics n = row_count;
    perform set_config('pgtap.own_role', case when n > 0 then 'OK' else 'ROWS:0' end, true);
  exception when others then
    perform set_config('pgtap.own_role', 'ERR:' || SQLSTATE, true);
  end;
  begin
    update public.profiles set status = 'DEACTIVATED' where id = '77777777-7777-4777-8777-000000000001';
    get diagnostics n = row_count;
    perform set_config('pgtap.own_status', case when n > 0 then 'OK' else 'ROWS:0' end, true);
  exception when others then
    perform set_config('pgtap.own_status', 'ERR:' || SQLSTATE, true);
  end;
  begin
    update public.profiles set unit_id = '77777777-7777-4777-8777-000000000011' where id = '77777777-7777-4777-8777-000000000001';
    get diagnostics n = row_count;
    perform set_config('pgtap.own_unit', case when n > 0 then 'OK' else 'ROWS:0' end, true);
  exception when others then
    perform set_config('pgtap.own_unit', 'ERR:' || SQLSTATE, true);
  end;
  begin
    update public.profiles set signature_ref_url = 'https://x.test/forged.png' where id = '77777777-7777-4777-8777-000000000001';
    get diagnostics n = row_count;
    perform set_config('pgtap.own_signature', case when n > 0 then 'OK' else 'ROWS:0' end, true);
  exception when others then
    perform set_config('pgtap.own_signature', 'ERR:' || SQLSTATE, true);
  end;
  begin
    update public.profiles set institutional_email = 'other@example.test' where id = '77777777-7777-4777-8777-000000000001';
    get diagnostics n = row_count;
    perform set_config('pgtap.own_email', case when n > 0 then 'OK' else 'ROWS:0' end, true);
  exception when others then
    perform set_config('pgtap.own_email', 'ERR:' || SQLSTATE, true);
  end;
  begin
    update public.profiles set photo_url = 'https://x.test/someone-else.png' where id = '77777777-7777-4777-8777-000000000001';
    get diagnostics n = row_count;
    perform set_config('pgtap.own_photo', case when n > 0 then 'OK' else 'ROWS:0' end, true);
  exception when others then
    perform set_config('pgtap.own_photo', 'ERR:' || SQLSTATE, true);
  end;
end;
$$;

reset role;

select is(current_setting('pgtap.own_full_name'), 'OK',
  'a user can still change their own full_name');
select is(current_setting('pgtap.own_role'), 'ERR:P0002',
  'a user cannot change their own role (no self-promotion to CSO)');
select is(current_setting('pgtap.own_status'), 'ERR:P0002',
  'a user cannot change their own status');
select is(current_setting('pgtap.own_unit'), 'ERR:P0002',
  'a user cannot move themselves to another unit');
select is(current_setting('pgtap.own_signature'), 'ERR:P0002',
  'a user cannot set their own signature reference');
select is(current_setting('pgtap.own_email'), 'ERR:P0002',
  'a user cannot change their own institutional_email');
select is(current_setting('pgtap.own_photo'), 'ERR:P0002',
  'a user cannot point their passport photo at another image');

select is(
  (select role::text from public.profiles where id = '77777777-7777-4777-8777-000000000001'),
  'REQUESTER',
  'the requester is still a REQUESTER after the attempts'
);

-- ---------------------------------------------------------------------------
-- As the CSO, on someone else's row (policy allows it; the guard still applies)
-- ---------------------------------------------------------------------------

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '77777777-7777-4777-8777-000000000002', 'role', 'authenticated')::text, true);
end;
$$;

set local role authenticated;

do $$
declare n int;
begin
  begin
    update public.profiles set role = 'DEAN' where id = '77777777-7777-4777-8777-000000000001';
    get diagnostics n = row_count;
    perform set_config('pgtap.cso_other_role', case when n > 0 then 'OK' else 'ROWS:0' end, true);
  exception when others then
    perform set_config('pgtap.cso_other_role', 'ERR:' || SQLSTATE, true);
  end;
  begin
    update public.profiles set full_name = 'Renamed By CSO' where id = '77777777-7777-4777-8777-000000000001';
    get diagnostics n = row_count;
    perform set_config('pgtap.cso_other_full_name', case when n > 0 then 'OK' else 'ROWS:0' end, true);
  exception when others then
    perform set_config('pgtap.cso_other_full_name', 'ERR:' || SQLSTATE, true);
  end;
end;
$$;

reset role;

select is(current_setting('pgtap.cso_other_role'), 'ERR:P0002',
  'even a CSO session cannot change a role directly (server-side only)');
select is(current_setting('pgtap.cso_other_full_name'), 'OK',
  'a CSO session can still rename another user');

-- ---------------------------------------------------------------------------
-- Server-side paths are unaffected
-- ---------------------------------------------------------------------------

select lives_ok(
  $q$update public.profiles set status = 'DEACTIVATED' where id = '77777777-7777-4777-8777-000000000001'$q$,
  'a non-session role (as the admin client and definer RPCs run) can still write any column'
);

select ok(
  not has_table_privilege('anon', 'public.profiles', 'UPDATE'),
  'anon holds no UPDATE privilege on profiles'
);

select * from finish();
rollback;
