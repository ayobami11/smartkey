# Database schema

Authoritative schema lives in `supabase/migrations/`. This document is a human-readable summary; update it on every migration.

## Tables

### profiles

- `id` UUID PK (= auth.users.id)
- `role` enum `user_role`: 'CSO' | 'DEAN' | 'VERIFIER' | 'REQUESTER' — internal identifiers elsewhere (routes, RPCs, audit events, e.g. `hod_decisions`, `HOD_APPROVED`) retain the old `hod` name for historical continuity, but the enum value itself is `DEAN`
- `full_name` text
- `institutional_email` text unique
- `unit_id` UUID FK units (Deans and Requesters only)
- `photo_url` text nullable
- `signature_ref_url` text nullable (Deans only; Supabase Storage URL)
- `stamp_ref_url` text nullable (Deans only)
- `status` enum: 'PENDING_ACTIVATION' | 'ACTIVE' | 'DEACTIVATED'
- `activation_token` text nullable — single-use token minted by `provision_user`; consumed by `/api/auth/register` or `/api/auth/activate-hod`
- `last_login_at` timestamptz nullable — app-stamped the moment a role actually finishes logging in: on OTP success in `verify-otp` for MFA roles (CSO, DEAN, VERIFIER), or on password success in `login` for REQUESTER (no MFA). Deliberately not Supabase Auth's own `auth.users.last_sign_in_at`, which GoTrue stamps at `signInWithPassword` — for MFA roles that's the OTP-request step, before the user has actually completed login, so a requested-but-never-entered OTP would otherwise show as a sign-in. Read by `GET /api/admin/users` for the `/cso/users` "Last sign-in" column.
- `created_at` timestamptz
- `updated_at` timestamptz

### units

The grouping unit for keys (formerly named `departments`; the table was renamed but the enum type `department_authoriser` and several FK/column names below kept their original names). Each row is a **faculty** (e.g. 'Faculty of Engineering') or the single non-faculty **'Administration'** group (central Senate-Building offices: VC, DVCs, Registrar, Bursary, Librarian). Keys hang off a unit via `keys.unit_id`; a faculty owns a Dean's Office + Porter's Lodge key.

- `id` UUID PK
- `name` text unique
- `faculty` text not null default '' — kept equal to `name` for now; redundant since the row name is the group. Slated to be dropped once the UI stops reading it.
- `authoriser` enum `department_authoriser`: 'DEAN' | 'CSO' (default 'DEAN') — who may authorise collectors and approve/decline weekend requests for this group's keys. Faculties are 'DEAN'; 'Administration' is 'CSO' (no Dean exists for it).
- `hod_id` UUID FK profiles (nullable, set when the Dean is assigned)

### guest_requesters

An external (non-registered) person who may collect a key for a single weekend. Guests are never a `profiles`/`auth.users` row (that would require an auth user and break the `invited_by` chain-of-trust); they are modelled as their own entity. RLS: CSO reads all. Dean reads guests whose request is routed to their unit (`requested_unit_id` or key's `unit_id`). VERIFIER reads guests where a `CODE_ISSUED` or `KEY_ISSUED` request exists (operational need only).

- `id` UUID PK
- `full_name` text
- `email` text
- `phone` text nullable
- `id_document_type` text (ID document the guest declares at submit; the verifier checks the physical ID at the desk)
- `id_document_number` text
- `created_at` timestamptz

### keys

- `id` UUID PK
- `code` text unique (e.g., 'NS-304')
- `zone` enum: 'NEW_SENATE' | 'OLD_SENATE'
- `room_name` text
- `unit_id` UUID FK units
- `status` enum: 'AVAILABLE' | 'ISSUED' | 'OVERDUE' | 'RETIRED'
- `retired_at` timestamptz nullable
- `key_count` int not null default 1, `CHECK (key_count >= 1)` — number of physical keys in the bunch this record represents

### authorisations

- Composite PK (key_id, profile_id)
- `key_id` UUID FK keys
- `profile_id` UUID FK profiles (must be REQUESTER role)
- `authorised_by` UUID FK profiles (the Dean for faculty keys, or the CSO for `authoriser='CSO'` Administration keys — see `nominate_collector`)
- `authorised_at` timestamptz
- Constraint: max 3 authorisations per key (enforced via trigger)

### requests

- `id` UUID PK
- `requester_id` UUID FK profiles nullable (null for external/guest requests)
- `key_id` UUID FK keys nullable (null until the HOD assigns a key on a guest approval)
- `guest_id` UUID FK guest_requesters nullable (set for external requests; null for registered-user requests)
- `requested_unit_id` UUID FK units nullable (unit a guest requests access within; drives Dean routing while `key_id` is null; null for registered-user requests)
- `access_token` uuid nullable (unguessable token a guest uses to reach their session-less status/code page; present only for guest requests)
- `decision_token` uuid nullable, unique (`idx_requests_decision_token`, partial on `is not null`) — one-click Approve/Decline in the weekend-submitted email. Minted only for **registered**, **Dean-authorised** WEEKEND requests (`POST /api/requests/submit`, right where `sendWeekendSubmittedEmail` already fires); never set for guest requests (approval needs a key assigned, which a one-click action can't supply) or Administration/CSO-routed requests (no submission email exists for those). Read by `GET`/`POST /api/public/dean-decision/[token]`; its validity is entirely bounded by `status = 'PENDING_HOD'`, not a separate expiry column
- `letter_url` text nullable (path in the `weekend-letters` bucket to the HOD authorisation letter uploaded at submit — by a guest, or optionally by a registered requester whose submission is compared against the Dean's reference signature at approval)
- `stamp_url` text nullable (path in the `weekend-letters` bucket to a close-up of the departmental stamp, optionally uploaded alongside `letter_url` by a registered requester; compared pixel-level against the Dean's `stamp_ref_url` at approval, independently of the signature check — see `docs/AI.md` §3)
- `requested_room` text nullable (free-text room/area a guest states they need access to; shown to the HOD before key assignment; null for registered-user requests)
- `type` enum: 'WEEKDAY' | 'WEEKEND'
- `requested_for` date (weekday: today; weekend: future Sat/Sun)
- `status` enum: 'PENDING_HOD' (weekend only) | 'APPROVED' (weekend only — HOD approved, awaiting on-the-day code) | 'CODE_ISSUED' | 'KEY_ISSUED' | 'KEY_RETURNED' | 'EXPIRED' | 'CANCELLED' | 'DECLINED'
- `code` text (6-digit collection code, only present in CODE_ISSUED state)
- `code_expires_at` timestamptz
- `return_code` text (6-digit return code; set by `request_return` while KEY_ISSUED, cleared on return)
- `return_code_expires_at` timestamptz (15 minutes from generation)
- `reminder_sent_at` timestamptz nullable (when the morning-of weekend collection-code reminder email was sent; stamped by `POST /api/cron/weekend-reminders` so a cron retry never double-emails)
- `return_deadline` timestamptz
- `risk_tier` enum: 'LOW' | 'MEDIUM' | 'HIGH' (computed at request time)
- `risk_factors` jsonb (array of {rule, description, weight})
- `hod_decision_id` UUID FK hod_decisions (weekend only)
- `issued_by` UUID FK profiles (verifier; nullable until issued)
- `issued_at` timestamptz nullable
- `returned_at` timestamptz nullable
- `created_at` timestamptz
- Constraint `requests_one_requester_kind`: exactly one of `requester_id` / `guest_id` is set (`num_nonnulls(requester_id, guest_id) = 1`)
- Constraint `requests_key_required_after_pending`: `key_id` may only be null while `status` is one of `'PENDING_HOD'` / `'DECLINED'` / `'EXPIRED'` / `'CANCELLED'` — the terminal states a guest request can reach before a Dean ever assigns a key. Widened twice: first from `PENDING_HOD` only to allow declines (`20260616120547_fix_guest_decline_constraint.sql`), then to allow expiry and cancellation (`20260802223014_widen_requests_key_required_for_terminal_states.sql`). The second widening fixed a live outage: `expire_stale_weekend_requests()` had been aborting on every run since a never-approved guest request first lapsed, so **no** stale weekend request expired and the Dean/CSO queues accumulated dead rows indefinitely

### hod_decisions (weekend approvals)

- `id` UUID PK
- `request_id` UUID FK requests
- `hod_id` UUID FK profiles
- `decision` enum: 'APPROVED' | 'DECLINED'
- `note` text nullable
- `signature_verified` boolean (true if verification passed)
- `signature_mismatch_pct` numeric nullable
- `decided_at` timestamptz

### shifts

- `id` UUID PK
- `shift_number` int (1, 2, or 3)
- `started_at` timestamptz
- `ended_at` timestamptz nullable
- `primary_officer_id` UUID FK profiles
- `secondary_officer_id` UUID FK profiles nullable

### shift_handovers

- `id` UUID PK
- `outgoing_shift_id` UUID FK shifts
- `incoming_shift_id` UUID FK shifts
- `incoming_officer_id` UUID FK profiles
- `acknowledged_keys` jsonb (array of key_ids acknowledged)
- `bulk_acknowledged` boolean
- `acknowledged_at` timestamptz

### shift_reports

- `id` UUID PK
- `shift_id` UUID FK shifts unique
- `markdown` text (Gemini output)
- `timeline` jsonb (structured event timeline)
- `metadata` jsonb
- `generated_at` timestamptz
- IMMUTABLE after insert (RLS denies UPDATE)

### shift_report_comments

- `id` UUID PK
- `report_id` UUID FK shift_reports
- `author_id` UUID FK profiles (CSO only)
- `text` text
- `created_at` timestamptz
- IMMUTABLE after insert

### incidents

- `id` UUID PK
- `reference` text unique (e.g., 'INC-2026-0042')
- `shift_id` UUID FK shifts
- `logged_by` UUID FK profiles
- `type` enum: 'MISSING_KEY' | 'SUSPICIOUS_ACTIVITY' | 'EQUIPMENT_FAULT' | 'PROCEDURAL' | 'OTHER'
- `severity` enum: 'LOW' | 'MEDIUM' | 'HIGH'
- `description` text
- `related_key_id` UUID FK keys nullable
- `related_person_id` UUID FK profiles nullable
- `photo_url` text nullable
- `status` enum: 'OPEN' | 'RESOLVED' | 'ESCALATED'
- `occurred_at` timestamptz
- `logged_at` timestamptz

### audit_log

- `id` UUID PK
- `event` text (matches `AuditEvent` union in TS)
- `actor_id` UUID FK profiles nullable (null for guest-initiated events — guests have no profile)
- `actor_role` enum nullable (denormalised for query performance; null for guest-initiated events)
- `actor_name` text nullable (denormalised at write time; snapshot of the actor's name; guest-initiated events carry the plain guest name with null `actor_id`/`actor_role` — the `external` boolean in `payload` is the discriminator, not the name)
- `actor_department` text nullable (denormalised at write time; null for non-departmental roles e.g. CSO/Verifier)
- `target_type` text
- `target_id` UUID
- `payload` jsonb (validated by zod schema in TS before write)
- `occurred_at` timestamptz
- IMMUTABLE — RLS denies UPDATE and DELETE for every RLS-governed role, including service. The guarantee is bounded by RLS, which Postgres does not enforce for superusers: a direct superuser connection (SQL editor, `postgres` role, admin console) can still update or delete rows, and a row deletion via that path was confirmed during the 2026-08 review. Every path the application can take is covered; superuser access to the production database is the trust boundary.

### risk_rule_config

CSO-editable risk engine weights/enable flags, one row per rule. Backs the `/cso/settings` "Risk rules" screen. RLS: `SELECT` for `authenticated` (the risk engine reads this inside a REQUESTER's own session at request-submit time); no write policy for any role — writes go only through `update_risk_config`.

- `rule_key` enum `risk_rule_key` PK: 'outside_operational_hours' | 'outstanding_key_not_returned' | 'weekend_without_memo' | 'excess_request_frequency' | 'collector_not_whitelisted' (matches the `rule` string each function in `src/lib/ai/risk/rules.ts` returns)
- `weight` int, `CHECK (weight BETWEEN 1 AND 10)`
- `enabled` boolean default true
- `updated_at` timestamptz

### risk_tier_config

CSO-editable LOW/MEDIUM/HIGH tier boundaries. Singleton table — fixed PK `00000000-0000-0000-0000-000000000001` plus a `CHECK (id = '...')` makes a second row impossible. Same RLS shape as `risk_rule_config` (read-all-authenticated, write via RPC only).

- `id` UUID PK, fixed value
- `medium_min` int, `CHECK (medium_min >= 1)` — inclusive lower bound for MEDIUM
- `high_min` int, `CHECK (high_min > medium_min)` — inclusive lower bound for HIGH
- `updated_at` timestamptz

### zone_hours

Per-zone access hours, backing the `/cso/settings` "Operational" tab (previously a static mockup. One row per `zone` value, seeded for both. RLS: `SELECT` for **both `anon` and `authenticated`** — deliberately wider than `risk_rule_config`, since the unauthenticated guest weekend form (`/weekend-access`) needs the same return-deadline default the requester dashboard uses, and operational hours aren't sensitive the way risk weights are. No write policy for any role; writes go through `update_operational_config` only.

- `zone` `public.zone` PK
- `weekday_open` / `weekday_close` time, not null
- `weekend_closed` boolean, default true
- `weekend_open` / `weekend_close` time, nullable (null while `weekend_closed`)
- `updated_at` timestamptz

### operational_config

CSO-editable return deadline and code-expiry minutes. Singleton table — fixed PK `00000000-0000-0000-0000-000000000002` plus a `CHECK (id = '...')`, same trick as `risk_tier_config` but a distinct fixed UUID. Same RLS shape as `zone_hours` (read for `anon` and `authenticated`; write via RPC only).

- `id` UUID PK, fixed value
- `return_deadline_time` time, not null, default `17:00`
- `code_expiry_minutes` int, `CHECK (code_expiry_minutes BETWEEN 5 AND 60)`, default 10 — governs the 6-digit **collection** code only. The separate **return**-code expiry (`request_return`/`request_return_guest`, 15 minutes) is untouched by this setting.
- `updated_at` timestamptz

### notification_preferences

Self-service notification preferences, shared by the `/requester/settings`, `/dean/settings`, and `/cso/settings` "Notifications" tabs (all three previously static mockups — see `docs/REVIEW_ACTIONS_BACKEND.md`). One row per profile, created lazily on first save (no backfill, no trigger). RLS: a profile reads/writes only its own row (`profile_id = auth.uid()`), no role check — the table is role-agnostic; each role's UI/route only reads and writes the columns it displays. No RPC, same trust level as editing `full_name` via `PATCH /api/profile/me`.

- `profile_id` UUID PK, FK `profiles`, `ON DELETE CASCADE`
- `key_issued_in_app` boolean, default true — Requester. Persists but doesn't currently gate anything; there's no separate in-app notification to suppress, the dashboard's live status (via Realtime) is the notification.
- `overdue_email` boolean, default true — Requester. Gates `POST /api/cron/overdue-reminders`. Absence of a row means the default applies, not an opt-out. Collection-code email has no column here — it can't be disabled.
- `weekend_decided_email` boolean, default true — Requester. Gates the existing `hod-decision` approval/decline email for **registered** requesters only; guests have no row and always receive it.
- `weekend_submitted_in_app` boolean, default true — Dean. Same "persists, gates nothing" treatment as `key_issued_in_app`: the Dean dashboard's live Realtime pending-count is the notification.
- `weekend_submitted_email` boolean, default true — Dean. Gates `sendWeekendSubmittedEmail`, sent when a weekend request lands in a **Dean-authorised** unit (`units.authoriser = 'DEAN'`); Administration (`authoriser = 'CSO'`) units resolve no recipient and send nothing.
- `signature_mismatch_email` boolean, default true — CSO. Gates `sendCsoSignatureMismatchEmail`, sent to every `ACTIVE` CSO opted in when `POST /api/requests/hod-decision` holds an approval on a signature/stamp mismatch (the same event that writes the `SIGNATURE_MISMATCH` audit entry powering the CSO dashboard's live alert feed). Absence of a row means opted in, same convention as `weekend_submitted_email`. There is deliberately no equivalent preference for the risk-alerts/signature-mismatch **in-app** feeds — those are core security-monitoring surfaces, not optional notifications, so nothing gates them.
- `digest_email` boolean, default false — Dean/CSO. See `notification_preferences.digest_email` below.
- `updated_at` timestamptz

### requests.overdue_reminder_sent_at

Added alongside `notification_preferences`. Mirrors `requests.reminder_sent_at` (the weekend-code reminder's idempotency column) but scoped to the overdue-return reminder — that one is queried for `type='WEEKEND', status='APPROVED'` rows specifically, so a second column avoids ambiguity. Stamped for every processed `KEY_ISSUED`/overdue row, including ones suppressed by preference — it means "this cycle was handled," not "an email was delivered."

### notification_preferences.digest_email

Added for the Dean/CSO "daily digest" tabs. **Defaults to `false`** — the opposite convention from every other column on this table (which default `true`). This is an opt-in enhancement, not a core notification; absence of a row means not opted in for this column specifically.

## RPCs (Postgres functions)

These wrap multi-table mutations in transactions and enforce business rules.

- `create_request(key_id, return_time, type, weekend_date)` — creates request + audit entry. WEEKDAY returns a code immediately (CODE_ISSUED); WEEKEND creates a PENDING_HOD request with no code.
- `generate_weekend_code(request_id, requester_id)` — requester-initiated. On the requested weekend date only, mints a short-lived 6-digit code (10-min expiry) for an APPROVED weekend request → CODE_ISSUED. Audit `CODE_ISSUED`. Raises TOO_EARLY before the date.
- `expire_request(request_id, requester_id)` — requester-initiated (fired automatically by the UI when a code lapses). Flips a genuinely-expired CODE_ISSUED request → EXPIRED, clears the code, audit `REQUEST_EXPIRED`. Idempotent (no-op if already moved on).
- `dismiss_expired_request(request_id, actor_id)` — authoriser-initiated. Lets a Dean (own faculty) or the CSO (any) clear a lapsed WEEKEND request out of the pending queue without waiting for the nightly sweep. Only accepts `PENDING_HOD` / `APPROVED` / `CODE_ISSUED` requests whose `requested_for < current_date`; moves them → EXPIRED, clears the code, audit `REQUEST_EXPIRED` with `reason: 'dismissed_by_authoriser'` and the dismissing actor. No `hod_decisions` row — this is housekeeping, not a decision. Authoriser gate mirrors `decline_weekend`. Execute revoked from `public`/`anon`.
- `expire_lapsed_codes()` — batch cleanup, cron-only (execute revoked from `public`/`anon`/`authenticated`). Expires any CODE_ISSUED request (weekday or weekend, registered or guest) whose `code_expires_at < now()` → EXPIRED, clears the code, writes a `REQUEST_EXPIRED` audit entry per row (guest-aware). Server-side backstop to the UI-fired `expire_request`: a closed browser tab no longer strands an unclaimed code, so the key frees up for another requester. Scheduled every 10 minutes via `pg_cron`. Idempotent.
- `expire_stale_weekend_requests()` — batch cleanup, cron-only (execute revoked from `public`/`anon`/`authenticated`). Expires WEEKEND requests whose `requested_for < current_date` and status is `PENDING_HOD` / `APPROVED` / `CODE_ISSUED` → EXPIRED, clears the code, writes a `REQUEST_EXPIRED` audit entry per row (guest-aware via `_write_audit_guest`). Without this, a weekend request whose date passes before a code is minted has no lifecycle terminus and permanently blocks re-requesting its key (`generate_weekend_code` raises TOO_EARLY once the date is past; `create_request` treats any non-terminal status as active). Scheduled daily at 00:15 UTC via `pg_cron` calling the function directly. Idempotent.
- `issue_key(request_id, verifier_id)` — flips request status, sets issued_at, audit entry.
- `request_return(request_id, requester_id)` — requester-initiated; generates a 6-digit return code (15-min expiry) for their own KEY_ISSUED request, audit entry (`RETURN_CODE_GENERATED`). Status stays KEY_ISSUED.
- `return_key(request_id, verifier_id, code?, returner_id?, override_reason?)` — flips request status to KEY_RETURNED, sets returned_at, clears the return code. Requires either `code` (verified → `KEY_RETURNED`) or `override_reason` (unverified → `KEY_RETURNED_UNVERIFIED` + a `SUSPICIOUS_ACTIVITY` incident when an open shift exists).
- `approve_weekend(request_id, hod_id, note?, signature_verified?, signature_mismatch_pct?, cso_override?)` — authoriser-aware: for an `authoriser='DEAN'` (faculty) key the actor must be that faculty's Dean; for an `authoriser='CSO'` (Administration) key the actor must be the CSO (no unit match, signature verification skipped). Creates hod_decisions row, moves request to APPROVED (no code is issued here — the requester mints one on the day via `generate_weekend_code`), audit entry. (Signature verification for the HOD path runs in TypeScript before this is called.) `cso_override` lets the CSO approve a held faculty-key request in place of the Dean, but only when a `SIGNATURE_MISMATCH` audit entry already exists for that request — enforced in the function body, not just the route.
- `decline_weekend(request_id, hod_id, note?, cso_override?)` — authoriser-aware actor gate (same Dean-vs-CSO branch on the request's effective unit — key's for registered, `requested_unit_id` for guests). Creates hod_decisions row, audit entry. `cso_override` mirrors `approve_weekend`'s.
- `nominate_collector(key_id, requester_id)` / `remove_collector(key_id, requester_id)` — authoriser-aware: the Dean for faculty keys (unit must match), CSO for `authoriser='CSO'` Administration keys. Enforce the max-3-slots and no-duplicate rules, audit entry.
- `mark_key_overdue()` — batch cleanup, cron-only. Flips `keys.status` to `OVERDUE` for every key whose issued request is `KEY_ISSUED` with `return_deadline < now()`, writing a `KEY_OVERDUE` audit entry per key (actor: the earliest-created active CSO profile). Scheduled hourly via `pg_cron` calling the function directly. (An `overdue-key-check` Edge Function used to wrap this RPC; it was never what `pg_cron` invoked after `20260622140052_cron_jobs_direct_sql.sql`, and was removed on 2026-08-04.) Returns `updated_count`. **Note**: `execute` is granted to `authenticated`, so despite "cron-only" this is callable by any signed-in user. Low impact — idempotent, and it only acts on genuinely-overdue keys — but the grant does not match the description. Since `20260812110000_requester_notifications.sql`, the same `overdue-key-check` cron job also calls `POST /api/cron/overdue-reminders` (over `pg_net`/HTTP, reusing the `weekend_cron_secret` Vault secret) right after this function — sending email is not something plpgsql can do directly, so unlike this function the reminder job has to go through the Node runtime.
- `schedule_pending_shift_report()` — batch cleanup, cron-only. Finds the most recently started shift with no `shift_reports` row, inserts a placeholder row (`markdown = 'PENDING_GENERATION'`), and writes a `SHIFT_REPORT_SCHEDULED` audit entry (actor: the earliest-created active CSO profile). No-ops if every shift already has a report. Scheduled daily at 18:00 UTC via `pg_cron` calling the function directly (`daily-shift-summary` job — the job name outlived the Edge Function of the same name, removed 2026-08-04). Execute is revoked from `anon` and `authenticated`, so this one is genuinely cron-only. The placeholder is distinct from `generate_shift_report`'s row — nothing currently fills in the placeholder's `markdown`/`timeline`/`metadata`, so this RPC alone does not complete report generation.
- `get_digest_stats(unit_id?, since?)` — read-only, cron-only (execute revoked from `public`/`anon`/`authenticated`, same pattern as `expire_lapsed_codes()`). Returns 8 activity counts since `since` (default last 24h): keys issued/returned, keys currently overdue, weekend requests submitted/pending, and 3 building-wide-only fields (high-risk requests, signature mismatches, incidents) that a Dean call simply doesn't read. `unit_id = null` means building-wide (CSO); a real unit id scopes to that faculty (Dean). Called by `POST /api/cron/daily-digest`, itself called by the `daily-digest` pg_cron job (07:00 UTC daily, same `pg_net`/Vault-secret pattern as `weekend-code-reminders`).

> **Fix (2026-08-12, `20260812140000_fix_pg_net_schema.sql`)**: every `pg_net`-based cron job (`weekend-code-reminders`, `overdue-key-check`'s HTTP call, `daily-digest`) called `extensions.http_post`, which does not exist — `pg_net`'s functions live in the `net` schema regardless of the `create extension pg_net with schema extensions` clause in the original `weekend-code-reminders` migration (a no-op; `pg_net` was already installed in `net` by Supabase's own bootstrap). Confirmed via `cron.job_run_details`: **`weekend-code-reminders` had failed every run since creation (2026-07-11 onward, every Sat/Sun) — no weekend collection-code reminder email had ever actually been sent.** All three jobs now call `net.http_post` with `timeout_milliseconds := 25000` (up from the 5000ms default, too tight for a route doing several DB round trips plus an SMTP send).

- `acknowledge_shift_handover(outgoing_shift_id, key_ids, bulk)` — creates handover row, audit entry per key.
- `generate_shift_report(shift_id)` — server-side; calls Gemini, inserts shift_reports row, audit entry.
- `add_report_comment(report_id, text)` — inserts immutable comment, audit entry.
- `provision_user(name, email, role, department_id?)` — creates profile, generates activation token, queues email, audit entry.
- `update_risk_config(rules, medium_min, high_min)` — CSO-only. `rules` is a JSON array of exactly 5 `{rule_key, weight, enabled}` objects, one per `risk_rule_key`. Updates `risk_rule_config` and the `risk_tier_config` singleton in one transaction, writes one `RISK_CONFIG_UPDATED` audit entry (not one per rule). Raises `INVALID_TIER_BOUNDS` if `high_min <= medium_min`, `INVALID_RULES` if `rules` isn't exactly 5 entries or contains an unknown `rule_key`.
- `update_operational_config(zone_hours, return_deadline_time, code_expiry_minutes)` — CSO-only. `zone_hours` is a JSON array of exactly 2 `{zone, weekday_open, weekday_close, weekend_closed, weekend_open, weekend_close}` objects, one per `public.zone` value. Updates `zone_hours` and the `operational_config` singleton in one transaction, writes one `OPERATIONAL_CONFIG_UPDATED` audit entry. Raises `INVALID_ZONE_HOURS` for a bad/incomplete zone entry (open ≥ close, or missing weekend hours while not closed) and `INVALID_CONFIG` for an out-of-range `code_expiry_minutes` or a null `return_deadline_time`. `create_request`, `generate_weekend_code`, and `generate_guest_weekend_code` all read `code_expiry_minutes` from here instead of each hardcoding their own expiry.

### External (guest) weekend RPCs

Guest analogues of the registered-user weekend flow. All are `SECURITY DEFINER`, key on an unguessable `access_token` instead of `auth.uid()` (guests have no session), and have execute revoked from `anon`/`public` — they are called only from server-side routes via the service-role admin client. `issue_key` is reused unchanged for the desk collection step.

- `_write_audit_guest(event, target_type, target_id, actor_name, payload)` — audit chokepoint for actions with no profile actor. Mirrors `_write_audit` but records `actor_id`/`actor_role` null and the plain guest `actor_name` (e.g. `'Jane Doe'`); callers set `payload->>'external' = true` as the discriminator.
- `create_guest_weekend_request(full_name, email, phone, id_type, id_number, department_id, weekend_date, return_deadline, letter_url, requested_room)` — inserts a `guest_requesters` row + a WEEKEND request (`PENDING_HOD`, no code, `access_token` minted), audit `REQUEST_CREATED`. Returns `{request_id, access_token}`.
- `approve_guest_weekend(request_id, hod_id, key_id, note?)` — authoriser-aware: validates the chosen key belongs to a group the actor authorises (the Dean's own unit, or any Administration key when the actor is the CSO), sets `key_id`, creates the `hod_decisions` row, moves the request → APPROVED, audit `HOD_APPROVED`. Granted to `authenticated`. (No signature verification — the approver reviews the uploaded letter manually.)
- `generate_guest_weekend_code(access_token)` — on `requested_for = current_date` only, mints a 10-min code → CODE_ISSUED, audit `CODE_ISSUED`. Raises TOO_EARLY before the date.
- `expire_guest_request(access_token)` — flips a genuinely-expired CODE_ISSUED request → EXPIRED, clears the code, audit `REQUEST_EXPIRED`. Idempotent.
- `request_return_guest(access_token)` — guest analogue of `request_return`. For the guest's own `KEY_ISSUED` request (looked up by `access_token`, `FOR UPDATE` locked), generates a 6-digit return code (15-min expiry), writes it to `return_code`/`return_code_expires_at`, and writes a `RETURN_CODE_GENERATED` audit entry via `_write_audit_guest`. Status stays `KEY_ISSUED`. Raises `NOT_FOUND` if the token doesn't resolve to a request, `CONFLICT` if the request isn't `KEY_ISSUED`. Called by `POST /api/public/weekend-request/[token]/return-code`.

## Backup and retention — known gap

Supabase's managed backups are currently the only copy of `audit_log`. Nothing is exported outside the project, so the evidentiary record shares a failure domain with the database it documents: project deletion, a bad restore, or corruption takes the audit trail with it. RLS protects the log from application roles; it does nothing for this.

Recommended direction, not implemented and not yet decided: a lightweight periodic export of `audit_log` (and `shift_reports`) to storage outside the Supabase project — a scheduled job appending newline-delimited JSON to a versioned or object-locked bucket, partitioned by date so exports accumulate rather than overwrite. Recorded here so the decision is visible, not to prescribe the design.

## Migrations workflow

1. Create migration: `supabase migration new <name>`.
2. Write SQL.
3. Update RLS policies if any new table or column.
4. Update generated TS types: `pnpm db:types`.
5. Apply locally: `pnpm db:migrate`.
6. Update `docs/DATABASE.md` and `docs/CHANGELOG.md`.
