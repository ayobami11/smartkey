# Changelog

Record material changes to the project so Claude has historical context for "why is this like this?" questions.

## Format

Each entry: date, brief title, what changed, why.

## Entries

### 2026-06-09 — Supabase Realtime subscriptions and offline guard (PR #39, branch: backend/feat/18-realtime-offline)

- `src/hooks/useRealtime.ts` — generic subscription hook. Accepts `table`, optional `filter`, and `onInsert`/`onUpdate`/`onDelete` callbacks. Reconnects automatically with exponential backoff (1 s → 2 s → 4 s → … → 30 s cap). After 30 s without a successful connection, emits `'offline'` status.
- `src/hooks/useConnectionStatus.ts` — module-level event emitter that returns `'connected' | 'reconnecting' | 'offline'`. Shared across all `useRealtime` instances so the app bar dot reflects the aggregate connection state.
- `src/components/smartkey/OfflineBanner.tsx` — full-bleed, sharp-edged banner with `aria-live="assertive"`. Renders only when status is `'offline'`; hidden otherwise. Carries the standard copy: "You are offline. Live updates are paused. New requests will appear when you reconnect."

### 2026-06-09 — Rule-based risk scoring engine (PR #38, branch: backend/feat/19-risk-engine)

- `src/lib/ai/risk/types.ts` — `RiskTier` (`'LOW' | 'MEDIUM' | 'HIGH'`), `RiskFactor` (`{ rule, description, weight }`), `RiskContext` (DB query results passed to rules), `RiskResult` (`{ tier, factors }`).
- `src/lib/ai/risk/rules.ts` — 5 deterministic rule functions, each returning a `RiskFactor | null`. Rules: `outsideOperationalHours` (weight 3), `outstandingKeyNotReturned` (weight 5), `weekendWithoutMemo` (weight 4), `excessRequestFrequency` (weight 2), `collectorNotWhitelisted` (weight 5). Weights configurable via env vars (`RISK_WEIGHT_*`).
- `src/lib/ai/risk/thresholds.ts` — tier boundaries from env vars (`RISK_TIER_MEDIUM_MIN` default 4, `RISK_TIER_HIGH_MIN` default 7). LOW: total < 4; MEDIUM: 4–6; HIGH: ≥ 7.
- `src/lib/ai/risk/engine.ts` — `evaluateRisk(context)` runs all 5 rules, sums active weights, maps to tier.
- `src/lib/ai/risk/rules.test.ts` + `engine.test.ts` — 24 unit tests covering every rule (positive + negative cases) and all three tier boundaries.
- `src/app/api/requests/submit/route.ts` — updated to run 4 parallel DB queries (operational hours, outstanding keys, weekend memo, request frequency), call `evaluateRisk()`, and back-fill `risk_tier` + `risk_factors` on the created request row. Risk evaluation is pure TypeScript; no external API.

### 2026-06-02 — Shift handover, incidents, reports, and AI risk-alerts routes (PR #37, branch: backend/feat/23-shift-incident-routes)

- Implemented shift, incident, report, and AI risk-alert route handlers.
- `GET /api/shifts/current` — returns the active shift record with officer identities and elapsed time.
- `POST /api/shifts/handover` → calls `acknowledge_shift_handover` RPC; supports per-key and bulk acknowledgement.
- `GET /api/incidents` — paginated, read-only incident log (no update/delete endpoint; log is append-only).
- `POST /api/incidents` — appends a new incident entry; HIGH severity incidents trigger an immediate CSO Realtime alert.
- `GET /api/reports` — paginated list of generated shift reports for CSO.
- `POST /api/reports/generate` → calls `generate_shift_report` RPC; Gemini client not yet wired — route exists with placeholder response pending AI integration.
- `POST /api/reports/[id]/comments` → calls `add_report_comment` RPC; comment is immutable after insert.
- `GET /api/ai/risk-alerts` — returns HIGH risk_tier requests from the last 24 hours for the CSO alert feed.

### 2026-06-02 — Key transaction and user admin API routes (PR #36, branch: backend/feat/17-key-admin-routes)

- Implemented all key transaction and user administration route handlers.
- `POST /api/keys/return` → calls `return_key` RPC; logs return with verifier and optional returner identity.
- `GET /api/keys/out` — returns all KEY_ISSUED and KEY_OVERDUE requests; supports zone and overdue_only filters.
- `GET /api/keys/history` — paginated transaction history for CSO and HOD; HOD view is dept-scoped via RLS.
- `POST /api/keys/mark-lost` — sets key status to RETIRED, creates a MISSING_KEY HIGH-severity incident, writes audit entry.
- `POST /api/admin/users` → calls `provision_user` RPC; creates profile, generates activation token, queues invite email.
- `GET /api/admin/users` — paginated user list with role, department, and status filters.
- `PATCH /api/admin/users/[id]/revoke` — sets profile status to DEACTIVATED and invalidates the Supabase Auth session immediately.
- `POST /api/admin/authorisations` — nominates a collector for a key slot; enforces max-3-per-key constraint at DB level.
- `DELETE /api/admin/authorisations/[key_id]/[requester_id]` — removes a collector from a slot; writes audit entry.

### 2026-05-25 — Auth API routes (PR #32, branch: backend/feat/15-auth-routes)

- Implemented all 6 auth route handlers under `src/app/api/auth/`.
- `POST /api/auth/login` — password auth; sends email OTP for CSO/HOD/VERIFIER; returns `mfa_required: true` flag.
- `POST /api/auth/verify-otp` — completes MFA via `verifyOtp`; returns full session.
- `POST /api/auth/logout` — calls `signOut()` to invalidate Supabase session.
- `POST /api/auth/reset-password` — triggers Supabase password-reset email; always 200 (no email enumeration).
- `POST /api/auth/register` — REQUESTER activation: invite token exchange + passport photo upload to `passport-photos` bucket + profile set to ACTIVE.
- `POST /api/auth/activate-hod` — HOD onboarding: invite token + signature + stamp upload to `hod-signatures` bucket + profile set to ACTIVE.
- All routes use `getUser()` (never `getSession()`), read role from `profiles.role`, use `logger` not `console.log`.

### 2026-05-25 — Request management API routes (PR #33, branch: backend/feat/16-request-routes)

- Implemented all 9 request route handlers under `src/app/api/requests/`.
- `POST /api/requests/submit` → calls `create_request` RPC; WEEKDAY returns 6-digit code, WEEKEND returns PENDING_HOD.
- `GET /api/requests/my` → cursor-paginated REQUESTER history with optional status filter.
- `GET /api/requests/pending` → HOD queue (PENDING_HOD), dept-scoped via RLS.
- `POST /api/requests/hod-decision` → calls `approve_weekend` or `decline_weekend` RPC.
- `GET /api/requests/cso-queue` → HIGH risk_tier CODE_ISSUED/KEY_ISSUED requests from last 24h (DB has no PENDING_CSO status).
- `POST /api/requests/cso-decision` → CSO can cancel CODE_ISSUED high-risk requests.
- `GET /api/requests/live-queue` → VERIFIER initial load of all CODE_ISSUED requests.
- `POST /api/requests/collect` → 6-digit code lookup + `issue_key` RPC + returns requester photo and key details.
- `POST /api/requests/cancel` → REQUESTER cancels own CODE_ISSUED request.
- Fixed `src/types/database.ts`: all RPC `Args` now use `p_` prefix to match Postgres function signatures; `Returns` typed as arrays.

### 2026-05-25 — Security and performance fixes (applied to Supabase cloud, no local migration file)

- Fixed `handle_updated_at()` and `check_authorisation_limit()` trigger functions: added `SECURITY DEFINER SET search_path = public` to prevent search path injection.
- Revoked `EXECUTE` from `PUBLIC` on all 12 RPCs and helper functions — access now granted only to `authenticated` role explicitly.
- Consolidated multiple permissive `SELECT` policies per table into single policies using `OR` conditions — eliminates per-policy overhead on every row check.
- Applied `(SELECT auth.uid())` in RLS `USING`/`WITH CHECK` clauses to force per-query evaluation rather than per-row evaluation.
- Added 5 missing FK indexes: `idx_authorisations_authorised_by`, `idx_incidents_logged_by`, `idx_requests_issued_by` (partial), `idx_shift_handovers_incoming_officer_id`, `idx_shifts_secondary_officer_id` (partial).

### 2026-05-25 — Postgres RPCs: 10 transactional functions (PR #31, branch: backend/feat/12-rpcs)

- All 10 RPCs run as `SECURITY DEFINER` so they bypass RLS and write the state change + audit log entry in a single transaction.
- `provision_user` — creates profile + activation token + email queue entry + audit entry.
- `create_request` — validates authorisation slot, generates 6-digit code, runs risk scoring, writes audit entry.
- `issue_key` — transitions request to KEY_ISSUED, clears code, writes audit entry.
- `return_key` — transitions request to KEY_RETURNED, sets returned_at, writes audit entry.
- `approve_weekend` — creates hod_decisions row, verifies signature, generates code, writes audit entry.
- `decline_weekend` — creates hod_decisions row with DECLINED decision, writes audit entry.
- `acknowledge_shift_handover` — creates shift_handovers row, writes per-key audit entries.
- `generate_shift_report` — creates immutable shift_reports row, writes audit entry.
- `add_report_comment` — creates immutable shift_report_comments row, writes audit entry.
- `mark_key_overdue` — batch-updates outstanding keys past deadline, writes audit entries (used by Edge Function).

### 2026-05-25 — Supabase client utilities, logger, audit writer, shared types (PR #29, branch: backend/feat/13-supabase-client)

- `src/lib/supabase/server.ts` — `createServerClient()`: cookie-based async client for route handlers and Server Components.
- `src/lib/supabase/client.ts` — `createBrowserClient()`: singleton for Client Components.
- `src/lib/supabase/middleware.ts` — `updateSession()` for root middleware.
- `src/lib/logger.ts` — structured logger (wraps `console` internally; `logger.info/warn/error`).
- `src/lib/audit/index.ts` — `writeAuditEntry()`: write-only helper that calls the audit RPC; enforces that audit entries go through a single path.
- `src/types/api.ts` — `ApiResponse<T>` envelope + `ok()` and `err()` helpers.
- `src/types/database.ts` — typed DB schema for all 12 tables, 10 RPCs, and all enums.

### 2026-05-25 — Next.js middleware: session validation and role gating (PR #28, branch: backend/feat/14-middleware)

- Root `middleware.ts` validates the Supabase session on every request via `getUser()` (never `getSession()`).
- Role-gates: `/cso/*` → CSO; `/hod/*` → HOD; `/verifier/*` → VERIFIER; `/me/*` → REQUESTER.
- Unauthenticated users redirected to `/login`. Authenticated users visiting `/login` redirected to their dashboard.
- Later fixed: RLS helper functions (`user_role()`, `user_department_id()`) moved from `auth` schema to `public` schema to resolve schema resolution errors.

### 2026-05-25 — RLS policies for all 12 tables (PR #30, branch: backend/feat/11-rls-policies)

- Row Level Security enabled on all 12 tables with role-aware `USING` and `WITH CHECK` clauses.
- `profiles`: own row (all roles); same-department reads (HOD); all reads (CSO).
- `keys`: all read; CSO INSERT/UPDATE; DELETE blocked.
- `authorisations`: HOD INSERT/DELETE for own dept; all read.
- `requests`: REQUESTER own; HOD dept-scoped; VERIFIER all; CSO all.
- `hod_decisions`: HOD dept-scoped; CSO all.
- `shifts`, `shift_handovers`: VERIFIER/CSO read.
- `shift_reports`, `shift_report_comments`, `incidents`, `audit_log`: append-only; CSO read; UPDATE/DELETE denied for all roles including service role on `incidents` and `audit_log`.

### 2026-05-25 — Database schema: all 12 tables (PR #27, branch: backend/feat/10-schema-migrations)

- Migration files for all 12 tables: `profiles`, `departments`, `keys`, `authorisations`, `requests`, `hod_decisions`, `shifts`, `shift_handovers`, `shift_reports`, `shift_report_comments`, `incidents`, `audit_log`.
- Business rules enforced at DB level: max-3-authorisations-per-key (UNIQUE constraint + trigger), append-only `incidents` and `audit_log` (permissions revoked), immutable `shift_reports` and `shift_report_comments` (RLS denies UPDATE).
- Human-readable `INC-YYYY-NNNN` incident reference generated by sequence-backed trigger.
- Indexes on all high-frequency query columns (requester_id, key_id, created_at, risk_tier, etc.).

### 2026-05-25 — Backend setup: Supabase init, env vars, gitignore (PR #26, branch: backend/setup/9-supabase-init)

- Created `supabase/config.toml` with SmartKey-specific auth settings (12-char password minimum, 6-digit OTP, 10-min OTP expiry, email confirmations enabled).
- Created `supabase/seed.sql` placeholder (populated in schema migrations PR).
- Created `supabase/migrations/` and `supabase/tests/` directories.
- Created `.env.local.example` with all required environment variables documented (Supabase, Gemini, Resend, risk engine weights, signature threshold, operational hours).
- Created `src/types/` directory.
- Updated `.gitignore`: `.env.local.example` now tracked; Supabase local dev artifacts excluded.

### 2026-05-XX — Initial scaffold

- Repository structure established.
- DESIGN.md authored and validated against Google's spec.
- shadcn/ui initialised with project tokens.
- Supabase project linked; initial migrations covering profiles, departments, keys, requests, audit_log.
