-- Risk engine configuration: rule weights/enabled flags + tier thresholds.
--
-- The risk engine (src/lib/ai/risk/) has always run with hardcoded weights and
-- env-var-only tier thresholds, despite the CSO "Risk rules" settings screen
-- claiming these are editable. This migration adds the tables that make that
-- screen real. Two tables (not a single JSONB blob) so real CHECK constraints
-- enforce valid weights and valid tier ordering at the engine level, matching
-- this repo's existing convention (e.g. keys.key_count, authorisations' max-3
-- trigger).
--
-- risk_rule_config is readable by every authenticated user because the risk
-- engine runs inside a REQUESTER's own session at request-submit time and
-- needs to read the current config. Writes go through update_risk_config only
-- (SECURITY DEFINER, CSO-gated) — no INSERT/UPDATE/DELETE policy exists for
-- any role, so those are default-denied regardless of caller.

create type public.risk_rule_key as enum (
  'outside_operational_hours',
  'outstanding_key_not_returned',
  'weekend_without_memo',
  'excess_request_frequency',
  'collector_not_whitelisted'
);

create table public.risk_rule_config (
  rule_key   public.risk_rule_key primary key,
  weight     int         not null check (weight between 1 and 10),
  enabled    boolean     not null default true,
  updated_at timestamptz not null default now()
);

alter table public.risk_rule_config enable row level security;

create policy risk_rule_config_select_authenticated
  on public.risk_rule_config
  for select
  to authenticated
  using (true);

-- Seed with today's hardcoded defaults from src/lib/ai/risk/rules.ts.
insert into public.risk_rule_config (rule_key, weight, enabled) values
  ('outside_operational_hours',   3, true),
  ('outstanding_key_not_returned', 5, true),
  ('weekend_without_memo',        4, true),
  ('excess_request_frequency',    2, true),
  ('collector_not_whitelisted',   5, true);

-- Singleton row: fixed PK + a CHECK that the PK equal that fixed value makes a
-- second row impossible (PK uniqueness rejects a duplicate id; the CHECK
-- rejects any other id).
create table public.risk_tier_config (
  id         uuid        primary key default '00000000-0000-0000-0000-000000000001'
                          check (id = '00000000-0000-0000-0000-000000000001'),
  medium_min int         not null check (medium_min >= 1),
  high_min   int         not null check (high_min > medium_min),
  updated_at timestamptz not null default now()
);

alter table public.risk_tier_config enable row level security;

create policy risk_tier_config_select_authenticated
  on public.risk_tier_config
  for select
  to authenticated
  using (true);

-- Seed matching today's env-var defaults (RISK_TIER_MEDIUM_MIN=4, RISK_TIER_HIGH_MIN=7).
insert into public.risk_tier_config (id, medium_min, high_min) values
  ('00000000-0000-0000-0000-000000000001', 4, 7);

-- RPC: update_risk_config
--
-- One CSO "Save" click = one consequential action = one audit entry, not five.
-- p_rules is a JSON array of exactly 5 {rule_key, weight, enabled} objects.
-- Mirrors nominate_collector's pattern: SECURITY DEFINER, search_path pinned,
-- auth.uid() actor resolution, P000N errcodes, _write_audit in the same
-- transaction as the state change.
create or replace function public.update_risk_config(
  p_rules      jsonb,
  p_medium_min int,
  p_high_min   int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id     uuid;
  v_actor_role   public.user_role;
  v_rule         jsonb;
  v_singleton_id constant uuid := '00000000-0000-0000-0000-000000000001';
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  select role into v_actor_role
  from public.profiles
  where id = v_actor_id;

  if v_actor_role is distinct from 'CSO' then
    raise exception 'FORBIDDEN: only the CSO can update risk configuration'
      using errcode = 'P0002';
  end if;

  if p_high_min <= p_medium_min then
    raise exception 'INVALID_TIER_BOUNDS: high_min must exceed medium_min'
      using errcode = 'P0004';
  end if;

  if p_rules is null or jsonb_array_length(p_rules) <> 5 then
    raise exception 'INVALID_RULES: exactly 5 rule entries are required'
      using errcode = 'P0004';
  end if;

  for v_rule in select * from jsonb_array_elements(p_rules)
  loop
    update public.risk_rule_config
       set weight     = (v_rule->>'weight')::int,
           enabled    = (v_rule->>'enabled')::boolean,
           updated_at = now()
     where rule_key = (v_rule->>'rule_key')::public.risk_rule_key;

    if not found then
      raise exception 'INVALID_RULES: unknown rule_key %', v_rule->>'rule_key'
        using errcode = 'P0004';
    end if;
  end loop;

  update public.risk_tier_config
     set medium_min = p_medium_min,
         high_min   = p_high_min,
         updated_at = now()
   where id = v_singleton_id;

  perform public._write_audit(
    'RISK_CONFIG_UPDATED',
    v_actor_id,
    v_actor_role,
    'risk_config',
    v_singleton_id,
    jsonb_build_object(
      'rules', p_rules,
      'medium_min', p_medium_min,
      'high_min', p_high_min
    )
  );
end;
$$;

revoke execute on function public.update_risk_config(jsonb, int, int)
  from public, anon;
grant execute on function public.update_risk_config(jsonb, int, int)
  to authenticated;
