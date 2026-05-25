-- =============================================================================
-- Migration: requests, hod_decisions
-- =============================================================================
-- requests tracks the full lifecycle of every key access request, from
-- submission through code generation, key issue, and return.
-- hod_decisions records the HOD's approve/decline decision on weekend requests,
-- including the pixel-level signature verification result.
--
-- Circular dependency resolution:
--   1. Create requests WITHOUT hod_decision_id.
--   2. Create hod_decisions (FK → requests).
--   3. ALTER requests ADD COLUMN hod_decision_id (FK → hod_decisions).
--
-- The 6-digit code is stored directly on the request and cleared (set to NULL)
-- once the key is physically issued to prevent replay attacks.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- requests
-- ---------------------------------------------------------------------------

create table public.requests (
  id              uuid                    primary key default gen_random_uuid(),
  requester_id    uuid                    not null references public.profiles(id) on delete restrict,
  key_id          uuid                    not null references public.keys(id) on delete restrict,
  type            public.request_type     not null,
  requested_for   date                    not null,
  status          public.request_status   not null default 'CODE_ISSUED',
  -- 6-digit numeric code; present only in CODE_ISSUED state, cleared on issue
  code            text,
  code_expires_at timestamptz,
  return_deadline timestamptz,
  -- AI risk scoring (computed at request time by the rule engine)
  risk_tier       public.risk_tier,
  risk_factors    jsonb,
  -- Verifier who physically issued the key
  issued_by       uuid                    references public.profiles(id) on delete restrict,
  issued_at       timestamptz,
  returned_at     timestamptz,
  created_at      timestamptz             not null default now()

  -- hod_decision_id added after hod_decisions table is created (below)
);

alter table public.requests enable row level security;

-- Index: requester history (most common read path for REQUESTER role)
create index idx_requests_requester_id on public.requests(requester_id);
-- Index: key-level history (HOD, CSO)
create index idx_requests_key_id on public.requests(key_id);
-- Index: status filter (verifier live queue, CSO queue)
create index idx_requests_status on public.requests(status);
-- Index: code lookup (verifier enters 6-digit code at desk — must be fast)
create index idx_requests_code on public.requests(code) where code is not null;
-- Index: risk tier filter (CSO anomaly feed)
create index idx_requests_risk_tier on public.requests(risk_tier);
-- Index: type + status for weekend flow
create index idx_requests_type_status on public.requests(type, status);
-- Index: created_at for chronological queues
create index idx_requests_created_at on public.requests(created_at desc);

-- ---------------------------------------------------------------------------
-- hod_decisions
-- ---------------------------------------------------------------------------

create table public.hod_decisions (
  id                     uuid                 primary key default gen_random_uuid(),
  request_id             uuid                 not null references public.requests(id) on delete cascade,
  hod_id                 uuid                 not null references public.profiles(id) on delete restrict,
  decision               public.hod_decision  not null,
  note                   text,
  -- Signature verification result from Sharp + Pixelmatch
  signature_verified     boolean              not null default false,
  signature_mismatch_pct numeric(5, 2),
  decided_at             timestamptz          not null default now()
);

alter table public.hod_decisions enable row level security;

-- Index: look up decisions by request
create index idx_hod_decisions_request_id on public.hod_decisions(request_id);
-- Index: HOD's own decision history
create index idx_hod_decisions_hod_id on public.hod_decisions(hod_id);

-- ---------------------------------------------------------------------------
-- ALTER requests: add hod_decision_id (FK → hod_decisions, circular dep resolved)
-- ---------------------------------------------------------------------------

alter table public.requests
  add column hod_decision_id uuid references public.hod_decisions(id) on delete set null;

-- Index: join requests ↔ hod_decisions
create index idx_requests_hod_decision_id on public.requests(hod_decision_id)
  where hod_decision_id is not null;
