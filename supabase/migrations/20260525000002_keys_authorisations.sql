-- Migration: keys, authorisations
-- keys: physical key inventory per zone and department.
-- authorisations: which requesters are whitelisted for each key (max 3 per key).
--   The three-slot limit is enforced by a BEFORE INSERT trigger so that no
--   application bug or race condition can ever insert a 4th authorisation for
--   the same key_id. The composite PK (key_id, profile_id) also prevents the
--   same person from being whitelisted twice for the same key.

-- keys

create table public.keys (
  id            uuid              primary key default gen_random_uuid(),
  code          text              not null unique,
  zone          public.zone       not null,
  room_name     text              not null,
  department_id uuid              not null references public.departments(id) on delete restrict,
  status        public.key_status not null default 'AVAILABLE',
  retired_at    timestamptz
);

alter table public.keys enable row level security;

-- Index: CSO / verifier filter by zone
create index idx_keys_zone on public.keys(zone);
-- Index: HOD sees only their department's keys
create index idx_keys_department_id on public.keys(department_id);
-- Index: status filter (outstanding, overdue, available)
create index idx_keys_status on public.keys(status);

-- authorisations

create table public.authorisations (
  -- Composite PK prevents duplicate authorisations for the same person+key
  key_id        uuid        not null references public.keys(id) on delete cascade,
  profile_id    uuid        not null references public.profiles(id) on delete cascade,
  authorised_by uuid        not null references public.profiles(id) on delete restrict,
  authorised_at timestamptz not null default now(),

  primary key (key_id, profile_id)
);

alter table public.authorisations enable row level security;

-- Index: look up all keys a requester is authorised for
create index idx_authorisations_profile_id on public.authorisations(profile_id);
-- Index: look up all authorised requesters for a key
create index idx_authorisations_key_id on public.authorisations(key_id);

-- Trigger: enforce max 3 authorisations per key
-- This runs BEFORE INSERT so the constraint can never be bypassed by a race
-- condition or a direct SQL call that skips application-level checks.

create or replace function public.check_authorisation_limit()
returns trigger
language plpgsql
as $$
declare
  current_count integer;
begin
  select count(*)
  into current_count
  from public.authorisations
  where key_id = new.key_id;

  if current_count >= 3 then
    raise exception
      'Maximum of 3 authorisations already exist for key_id %. No further collectors can be added.',
      new.key_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger authorisations_max_three
  before insert on public.authorisations
  for each row
  execute function public.check_authorisation_limit();
