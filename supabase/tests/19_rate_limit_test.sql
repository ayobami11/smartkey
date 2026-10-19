-- ---------------------------------------------------------------------------
-- 19 — Guest form rate limit (20261019100000_guest_rate_limit.sql)
--
--   * rate_limit_hits: RLS on, no policies, no anon/authenticated grants, and
--     a CHECK that only accepts a 64-hex-character hash as the key.
--   * check_rate_limit: service_role only, SECURITY DEFINER; records a hit
--     and returns 0 under the limit; at the limit returns the seconds until a
--     slot frees and records nothing; keys and buckets are independent; hits
--     outside the window neither count nor survive the call.
--   * The daily cleanup job is scheduled.
--
-- now() is fixed for the whole transaction, so hits recorded here share one
-- timestamp; older hits are inserted directly with a backdated hit_at.
-- ---------------------------------------------------------------------------

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions;

select plan(23);

-- ---------------------------------------------------------------------------
-- Table and grants
-- ---------------------------------------------------------------------------

select ok(
  (select relrowsecurity from pg_class where oid = 'public.rate_limit_hits'::regclass),
  'rate_limit_hits has RLS enabled'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'public' and tablename = 'rate_limit_hits'),
  0,
  'rate_limit_hits has no policies'
);

select ok(
  not has_table_privilege('anon', 'public.rate_limit_hits', 'SELECT')
  and not has_table_privilege('anon', 'public.rate_limit_hits', 'INSERT')
  and not has_table_privilege('anon', 'public.rate_limit_hits', 'DELETE'),
  'anon has no grant on rate_limit_hits'
);

select ok(
  not has_table_privilege('authenticated', 'public.rate_limit_hits', 'SELECT')
  and not has_table_privilege('authenticated', 'public.rate_limit_hits', 'INSERT')
  and not has_table_privilege('authenticated', 'public.rate_limit_hits', 'DELETE'),
  'authenticated has no grant on rate_limit_hits'
);

select ok(
  not has_function_privilege('anon',
    'public.check_rate_limit(text, text, integer, interval)', 'EXECUTE'),
  'anon cannot execute check_rate_limit'
);

select ok(
  not has_function_privilege('authenticated',
    'public.check_rate_limit(text, text, integer, interval)', 'EXECUTE'),
  'authenticated cannot execute check_rate_limit'
);

select ok(
  has_function_privilege('service_role',
    'public.check_rate_limit(text, text, integer, interval)', 'EXECUTE'),
  'service_role can execute check_rate_limit'
);

select ok(
  (select prosecdef from pg_proc
   where oid = 'public.check_rate_limit(text, text, integer, interval)'::regprocedure),
  'check_rate_limit is SECURITY DEFINER'
);

-- ---------------------------------------------------------------------------
-- Counting and recording: limit 2 per hour
-- ---------------------------------------------------------------------------

select is(
  public.check_rate_limit('pgtap19:ip', repeat('a', 64), 2, interval '1 hour'),
  0,
  'the first hit is allowed'
);

select is(
  public.check_rate_limit('pgtap19:ip', repeat('a', 64), 2, interval '1 hour'),
  0,
  'the second hit is allowed'
);

select ok(
  public.check_rate_limit('pgtap19:ip', repeat('a', 64), 2, interval '1 hour') > 0,
  'the third hit is refused'
);

select is(
  (select count(*)::integer from public.rate_limit_hits
   where bucket = 'pgtap19:ip' and key_hash = repeat('a', 64)),
  2,
  'a refused hit is not recorded'
);

select is(
  public.check_rate_limit('pgtap19:ip', repeat('a', 64), 2, interval '1 hour'),
  3600,
  'retry-after is the time until the oldest hit leaves the window'
);

select is(
  public.check_rate_limit('pgtap19:ip', repeat('b', 64), 2, interval '1 hour'),
  0,
  'another key has its own count'
);

select is(
  public.check_rate_limit('pgtap19:email', repeat('a', 64), 2, interval '1 hour'),
  0,
  'another bucket has its own count for the same key'
);

-- ---------------------------------------------------------------------------
-- The window
-- ---------------------------------------------------------------------------

insert into public.rate_limit_hits (bucket, key_hash, hit_at) values
  ('pgtap19:ip', repeat('c', 64), now() - interval '2 hours'),
  ('pgtap19:ip', repeat('c', 64), now() - interval '90 minutes');

select is(
  public.check_rate_limit('pgtap19:ip', repeat('c', 64), 2, interval '1 hour'),
  0,
  'hits outside the window do not count'
);

select is(
  (select count(*)::integer from public.rate_limit_hits
   where bucket = 'pgtap19:ip' and key_hash = repeat('c', 64)),
  1,
  'hits outside the window are deleted, leaving the new one'
);

insert into public.rate_limit_hits (bucket, key_hash, hit_at) values
  ('pgtap19:ip', repeat('d', 64), now() - interval '50 minutes'),
  ('pgtap19:ip', repeat('d', 64), now() - interval '10 minutes');

select is(
  public.check_rate_limit('pgtap19:ip', repeat('d', 64), 2, interval '1 hour'),
  600,
  'retry-after counts from the oldest hit still in the window'
);

insert into public.rate_limit_hits (bucket, key_hash, hit_at) values
  ('pgtap19:ip', repeat('e', 64), now() - interval '50 minutes'),
  ('pgtap19:ip', repeat('e', 64), now() - interval '30 minutes'),
  ('pgtap19:ip', repeat('e', 64), now() - interval '10 minutes');

select is(
  public.check_rate_limit('pgtap19:ip', repeat('e', 64), 2, interval '1 hour'),
  1800,
  'over a lowered limit, retry-after waits for enough hits to expire'
);

-- ---------------------------------------------------------------------------
-- Refusals
-- ---------------------------------------------------------------------------

select throws_ok(
  $$insert into public.rate_limit_hits (bucket, key_hash) values ('pgtap19:ip', '203.0.113.7')$$,
  '23514',
  null,
  'a raw IP cannot be stored as a key'
);

select throws_ok(
  $$select public.check_rate_limit('pgtap19:ip', repeat('f', 64), 0, interval '1 hour')$$,
  'P0004',
  'VALIDATION: invalid rate limit arguments',
  'a limit below 1 is refused'
);

select throws_ok(
  $$select public.check_rate_limit('pgtap19:ip', repeat('f', 64), 2, interval '0 seconds')$$,
  'P0004',
  'VALIDATION: invalid rate limit arguments',
  'an empty window is refused'
);

-- ---------------------------------------------------------------------------
-- Cleanup job
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::integer from cron.job where jobname = 'rate-limit-hits-cleanup'),
  1,
  'the rate-limit-hits-cleanup job is scheduled'
);

select * from finish();

rollback;
