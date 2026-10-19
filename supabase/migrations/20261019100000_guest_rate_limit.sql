-- Rate limit for the guest weekend-request form.
--
-- POST /api/public/weekend-request needs no login. Every accepted submission
-- writes a guest_requesters row and a request, stores an uploaded letter of up
-- to 5 MB, and sends two emails (one to the guest, one to a Dean or every
-- active CSO). Until now nothing limited how often anyone could do that.
--
-- The app runs as Vercel serverless functions, so an in-memory counter would
-- be per instance and forgotten on every cold start. The count lives here
-- instead: check_rate_limit() counts the recent hits for one (bucket, key),
-- and records a new one only when the caller is under the limit, atomically.
--
-- Keys are never raw IP addresses or emails. The route hashes them with
-- HMAC-SHA-256 under the RATE_LIMIT_SALT env var before calling, and the
-- key_hash CHECK below only accepts 64 hex characters, so a raw value cannot
-- be stored even by mistake.
--
-- The table has RLS enabled and no policies, and its grants are revoked from
-- anon and authenticated: only check_rate_limit (SECURITY DEFINER,
-- service_role only) and the cleanup job touch it.
--
-- Deploy order: either order works. The route fails open when the function
-- is missing (it logs the error and lets the submission through), so the code
-- can ship first; the limit starts applying once this migration is in.

-- ---------------------------------------------------------------------------
-- rate_limit_hits — one row per accepted hit, per (bucket, hashed key)
-- ---------------------------------------------------------------------------

create table public.rate_limit_hits (
  id        bigint generated always as identity primary key,
  bucket    text        not null check (char_length(bucket) between 1 and 64),
  key_hash  text        not null check (key_hash ~ '^[0-9a-f]{64}$'),
  hit_at    timestamptz not null default now()
);

comment on table public.rate_limit_hits is
  'Hits counted by check_rate_limit(). key_hash is an HMAC-SHA-256 of the client IP or email, never the raw value.';

-- The function's count and its per-key delete.
create index idx_rate_limit_hits_bucket_key
  on public.rate_limit_hits (bucket, key_hash, hit_at);

-- The daily cleanup.
create index idx_rate_limit_hits_hit_at
  on public.rate_limit_hits (hit_at);

alter table public.rate_limit_hits enable row level security;

revoke all on table public.rate_limit_hits from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- check_rate_limit — count and record one hit, atomically
--
-- Returns 0 when the hit was under p_limit for p_window (it is recorded), or
-- the number of seconds until a slot frees up (nothing is recorded, so a
-- refused caller does not push their own window further out).
--
-- Concurrent calls for the same (bucket, key) serialise on a transaction
-- advisory lock, so two requests at the limit cannot both get in.
-- Rows for this key that have left the window are deleted on each call; the
-- daily cron job below removes the rest.
-- ---------------------------------------------------------------------------

create or replace function public.check_rate_limit(
  p_bucket text,
  p_key    text,
  p_limit  integer,
  p_window interval
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count       integer;
  v_frees_at    timestamptz;
  v_retry_after integer := 0;
begin
  if p_bucket is null or p_key is null or p_limit is null or p_limit < 1
     or p_window is null or p_window <= interval '0 seconds' then
    raise exception 'VALIDATION: invalid rate limit arguments'
      using errcode = 'P0004';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_bucket || ':' || p_key, 0));

  delete from public.rate_limit_hits
  where bucket = p_bucket
    and key_hash = p_key
    and hit_at <= now() - p_window;

  select count(*)::integer
  into v_count
  from public.rate_limit_hits
  where bucket = p_bucket
    and key_hash = p_key;

  if v_count >= p_limit then
    -- The hit whose expiry brings the count back under the limit. With the
    -- count at the limit that is the oldest; if the limit was lowered since,
    -- it is a later one.
    select hit_at + p_window
    into v_frees_at
    from public.rate_limit_hits
    where bucket = p_bucket
      and key_hash = p_key
    order by hit_at
    offset v_count - p_limit
    limit 1;

    v_retry_after := greatest(1, ceil(extract(epoch from (v_frees_at - now())))::integer);
  else
    insert into public.rate_limit_hits (bucket, key_hash)
    values (p_bucket, p_key);
  end if;

  return v_retry_after;
end;
$$;

revoke execute on function public.check_rate_limit(text, text, integer, interval)
  from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, text, integer, interval)
  to service_role;

-- ---------------------------------------------------------------------------
-- Cleanup: keys that never come back would otherwise keep their last few
-- rows forever. Two days is longer than any window in use (the longest is
-- the per-email day); raise it if a longer window is ever added.
-- ---------------------------------------------------------------------------

select cron.schedule('rate-limit-hits-cleanup', '30 3 * * *', $$
  delete from public.rate_limit_hits where hit_at < now() - interval '2 days';
$$);
