-- Migration: shifts, shift_handovers
-- shifts records each 8-hour security officer shift (up to 3 per day).
-- shift_handovers records the incoming officer's acknowledgement of all
-- outstanding keys at the moment of shift change — the digital equivalent
-- of the chain-of-custody sign-off in the paper logbook.
--
-- The handover screen locks the verifier dashboard until the incoming officer
-- acknowledges every outstanding key (individually or bulk). This table stores
-- the complete record of what was acknowledged and by whom.

-- shifts

create table public.shifts (
  id                   uuid        primary key default gen_random_uuid(),
  -- 1, 2, or 3 (morning / afternoon / night)
  shift_number         integer     not null check (shift_number between 1 and 3),
  started_at           timestamptz not null,
  ended_at             timestamptz,
  primary_officer_id   uuid        not null references public.profiles(id) on delete restrict,
  secondary_officer_id uuid        references public.profiles(id) on delete restrict
);

alter table public.shifts enable row level security;

-- Index: active shift lookup (verifier dashboard on load)
create index idx_shifts_ended_at on public.shifts(ended_at) where ended_at is null;
-- Index: officer's own shift history
create index idx_shifts_primary_officer_id on public.shifts(primary_officer_id);
-- Index: chronological order for CSO reporting
create index idx_shifts_started_at on public.shifts(started_at desc);

-- shift_handovers

create table public.shift_handovers (
  id                  uuid        primary key default gen_random_uuid(),
  outgoing_shift_id   uuid        not null references public.shifts(id) on delete restrict,
  incoming_shift_id   uuid        not null references public.shifts(id) on delete restrict,
  incoming_officer_id uuid        not null references public.profiles(id) on delete restrict,
  -- jsonb array of key UUIDs acknowledged by the incoming officer
  acknowledged_keys   jsonb       not null default '[]',
  -- true when the officer used "bulk acknowledge" rather than per-key
  bulk_acknowledged   boolean     not null default false,
  acknowledged_at     timestamptz not null default now(),

  -- Only one handover record per shift transition
  unique (outgoing_shift_id, incoming_shift_id)
);

alter table public.shift_handovers enable row level security;

-- Index: look up handover by outgoing shift (most common join)
create index idx_shift_handovers_outgoing_shift_id on public.shift_handovers(outgoing_shift_id);
-- Index: look up handover by incoming shift
create index idx_shift_handovers_incoming_shift_id on public.shift_handovers(incoming_shift_id);
