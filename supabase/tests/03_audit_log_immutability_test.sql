-- ---------------------------------------------------------------------------
-- 03 — Audit log immutability
--
-- Covers: the audit_log RLS policies and table grants that make the log
-- append-only (ADR-0002, docs/ARCHITECTURE.md "RLS overview").
--
-- SCOPE OF THE GUARANTEE — read this before trusting the file.
--
--   public.audit_log has RLS enabled but NOT forced (relforcerowsecurity =
--   false). RLS is therefore not evaluated for the table owner (postgres), for
--   any superuser, or for a role with BYPASSRLS — which in Supabase includes
--   `service_role`. What these tests prove is that the two *RLS-governed*
--   client roles the browser and the API ever authenticate as — `anon` and
--   `authenticated` — cannot modify or delete an entry, whatever their
--   SmartKey role. A direct connection with the service-role key or the
--   database password can still rewrite the log; that is a deployment and
--   key-custody concern, not something RLS can express.
--
--   The two roles fail in different ways and both are asserted:
--     * `authenticated` has no UPDATE/DELETE grant at all, so the statement is
--       rejected outright with 42501 before RLS is ever consulted.
--     * `anon` *does* carry UPDATE/DELETE grants (a Supabase default that was
--       never revoked) but has no policy of any kind on the table, so RLS
--       filters every row away and the statement silently affects 0 rows.
--       Nothing is modified either way — but the failure is silent, which is
--       why it is asserted on row counts rather than on an exception.
--
-- Role-switched work happens inside DO blocks that stash their outcome in a
-- transaction-local GUC. pgTAP's own assertion functions write to session temp
-- tables owned by postgres, so they must not be called while the role is
-- switched — hence the capture-then-assert shape.
--
-- Everything runs inside one transaction and is rolled back at the end.
-- ---------------------------------------------------------------------------

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions;

select plan(13);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('33333333-3333-4333-8333-000000000001', 'pgtap.audit.cso@example.test'),
  ('33333333-3333-4333-8333-000000000002', 'pgtap.audit.requester@example.test');

insert into public.units (id, name, faculty, authoriser) values
  ('33333333-3333-4333-8333-000000000010', 'pgTAP Faculty of Audit', 'pgTAP Faculty of Audit', 'DEAN');

insert into public.profiles (id, role, full_name, institutional_email, unit_id, status) values
  ('33333333-3333-4333-8333-000000000001', 'CSO',       'pgTAP CSO Audit',       'pgtap.audit.cso@example.test',       null,                                   'ACTIVE'),
  ('33333333-3333-4333-8333-000000000002', 'REQUESTER', 'pgTAP Requester Audit', 'pgtap.audit.requester@example.test', '33333333-3333-4333-8333-000000000010', 'ACTIVE');

insert into public.audit_log (id, event, actor_id, actor_role, actor_name, target_type, target_id, payload) values
  ('33333333-3333-4333-8333-000000000050', 'KEY_ISSUED',
   '33333333-3333-4333-8333-000000000001', 'CSO', 'pgTAP CSO Audit',
   'request', '33333333-3333-4333-8333-000000000051', '{"pgtap": true}'::jsonb);

-- ---------------------------------------------------------------------------
-- The policies say what they are supposed to say
-- ---------------------------------------------------------------------------

select is(
  (select qual from pg_policies
   where schemaname = 'public' and tablename = 'audit_log'
     and policyname = 'audit_log_update_denied'),
  'false',
  'the audit_log UPDATE policy is an unconditional deny'
);

select is(
  (select qual from pg_policies
   where schemaname = 'public' and tablename = 'audit_log'
     and policyname = 'audit_log_delete_denied'),
  'false',
  'the audit_log DELETE policy is an unconditional deny'
);

select ok(
  not has_table_privilege('authenticated', 'public.audit_log', 'UPDATE'),
  'the authenticated role holds no UPDATE grant on audit_log'
);

select ok(
  not has_table_privilege('authenticated', 'public.audit_log', 'DELETE'),
  'the authenticated role holds no DELETE grant on audit_log'
);

-- ---------------------------------------------------------------------------
-- As an authenticated CSO — the most privileged reader of the log
-- ---------------------------------------------------------------------------

do $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub',  '33333333-3333-4333-8333-000000000001',
      'role', 'authenticated'
    )::text,
    true
  );
end;
$$;

set local role authenticated;

do $$
declare n int;
begin
  select count(*) into n from public.audit_log
  where id = '33333333-3333-4333-8333-000000000050';
  perform set_config('pgtap.cso_select', n::text, true);

  begin
    update public.audit_log set event = 'TAMPERED'
    where id = '33333333-3333-4333-8333-000000000050';
    get diagnostics n = row_count;
    perform set_config('pgtap.cso_update', 'ROWS:' || n::text, true);
  exception when others then
    perform set_config('pgtap.cso_update', 'ERR:' || SQLSTATE, true);
  end;

  begin
    delete from public.audit_log
    where id = '33333333-3333-4333-8333-000000000050';
    get diagnostics n = row_count;
    perform set_config('pgtap.cso_delete', 'ROWS:' || n::text, true);
  exception when others then
    perform set_config('pgtap.cso_delete', 'ERR:' || SQLSTATE, true);
  end;

  begin
    insert into public.audit_log (event, target_type, target_id, payload)
    values ('FORGED', 'request', '33333333-3333-4333-8333-000000000052', '{}'::jsonb);
    perform set_config('pgtap.cso_insert', 'OK', true);
  exception when others then
    perform set_config('pgtap.cso_insert', 'ERR:' || SQLSTATE, true);
  end;
end;
$$;

reset role;

select is(
  current_setting('pgtap.cso_select'),
  '1',
  'an authenticated CSO can read an audit entry'
);

select is(
  current_setting('pgtap.cso_update'),
  'ERR:42501',
  'an authenticated CSO cannot UPDATE an audit entry (insufficient privilege)'
);

select is(
  current_setting('pgtap.cso_delete'),
  'ERR:42501',
  'an authenticated CSO cannot DELETE an audit entry (insufficient privilege)'
);

select is(
  current_setting('pgtap.cso_insert'),
  'ERR:42501',
  'an authenticated CSO cannot INSERT directly — entries come from the RPCs only'
);

-- ---------------------------------------------------------------------------
-- As an authenticated non-CSO — no read access at all
-- ---------------------------------------------------------------------------

do $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub',  '33333333-3333-4333-8333-000000000002',
      'role', 'authenticated'
    )::text,
    true
  );
end;
$$;

set local role authenticated;

do $$
declare n int;
begin
  select count(*) into n from public.audit_log
  where id = '33333333-3333-4333-8333-000000000050';
  perform set_config('pgtap.requester_select', n::text, true);
end;
$$;

reset role;

select is(
  current_setting('pgtap.requester_select'),
  '0',
  'an authenticated non-CSO cannot read the audit log'
);

-- ---------------------------------------------------------------------------
-- As anon — holds the grants, but no policy matches, so 0 rows every time
-- ---------------------------------------------------------------------------

set local role anon;

do $$
declare n int;
begin
  select count(*) into n from public.audit_log
  where id = '33333333-3333-4333-8333-000000000050';
  perform set_config('pgtap.anon_select', n::text, true);

  begin
    update public.audit_log set event = 'TAMPERED'
    where id = '33333333-3333-4333-8333-000000000050';
    get diagnostics n = row_count;
    perform set_config('pgtap.anon_update', 'ROWS:' || n::text, true);
  exception when others then
    perform set_config('pgtap.anon_update', 'ERR:' || SQLSTATE, true);
  end;

  begin
    delete from public.audit_log
    where id = '33333333-3333-4333-8333-000000000050';
    get diagnostics n = row_count;
    perform set_config('pgtap.anon_delete', 'ROWS:' || n::text, true);
  exception when others then
    perform set_config('pgtap.anon_delete', 'ERR:' || SQLSTATE, true);
  end;
end;
$$;

reset role;

select is(
  current_setting('pgtap.anon_select'),
  '0',
  'anon cannot read the audit log'
);

select is(
  current_setting('pgtap.anon_update'),
  'ROWS:0',
  'an anon UPDATE is filtered to zero rows by RLS'
);

select is(
  current_setting('pgtap.anon_delete'),
  'ROWS:0',
  'an anon DELETE is filtered to zero rows by RLS'
);

-- ---------------------------------------------------------------------------
-- After every attempt, the entry is byte-for-byte what it was
-- ---------------------------------------------------------------------------

select is(
  (select event from public.audit_log
   where id = '33333333-3333-4333-8333-000000000050'),
  'KEY_ISSUED',
  'the audit entry survived every modification attempt unchanged'
);

select * from finish();

rollback;
