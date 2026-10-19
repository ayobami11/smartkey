# Database schema

Authoritative schema lives in `supabase/migrations/`. This document is a human-readable summary; update it on every migration.

## Tables

### profiles

**Column guard** (`20261013095000_profiles_column_guard.sql`): the `profiles_update` RLS policy lets a session update its own row and the CSO any row, and `authenticated` holds UPDATE on the table. The `profiles_protect_columns` `BEFORE UPDATE` trigger (`protect_profile_columns()`) therefore rejects any change except `full_name` when the statement runs as `authenticated` or `anon` (`FORBIDDEN`, `P0002`). Every other column — `role`, `status`, `unit_id`, `institutional_email`, `photo_url`, `signature_ref_url`, `stamp_ref_url`, `activation_token`, `last_login_at` — is written server-side only: by the service-role admin client in the API routes, or by `SECURITY DEFINER` RPCs (which run as the function owner, so the guard passes them). It is an allowlist over the whole row, so a column added later is protected by default. Until 2026-10-13 nothing limited the columns, so any signed-in user could promote themselves to CSO through the REST API. `anon` also has its UPDATE grant revoked.

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
- `status` enum: 'AVAILABLE' | 'ISSUED' | 'OVERDUE' | 'RETIRED' — coarse: `ISSUED` means every copy is out, and `OVERDUE` only flips on the hourly `mark_key_overdue()` cron. `RETIRED` is authoritative; for anything else (how many copies are free, held, reserved or late) read `get_key_occupancy()` — see **Occupancy** in `docs/GLOSSARY.md`
- `retired_at` timestamptz nullable
- Created only through `create_key` (which writes `KEY_CREATED`): `20261014090000_admin_audit_gaps.sql` dropped the `keys_insert_cso` INSERT policy. `keys_update_cso` remains, though no application code updates `keys` directly
- `key_count` int not null default 1, `CHECK (key_count >= 1)` — how many **interchangeable copies** of this room's key exist, and therefore how many people may hold one simultaneously. It is a **capacity**, not a bunch handed over as a unit: someone takes one copy and the rest stay collectable. Enforced by the `requests_key_capacity` trigger (below). Production uses it: `FENG-005` (Electrical Engineering HOD's Office) has 12 and `ADM-VC` has 2; every other key has 1. A previous version of this doc read the column the opposite way — see `docs/CHANGELOG.md` 2026-09-06

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
- `key_id` UUID FK keys nullable (null until the Dean assigns a key on a guest approval)
- `guest_id` UUID FK guest_requesters nullable (set for external requests; null for registered-user requests)
- `requested_unit_id` UUID FK units nullable (unit a guest requests access within; drives Dean routing while `key_id` is null; null for registered-user requests)
- `access_token` uuid nullable (unguessable token a guest uses to reach their session-less status/code page; present only for guest requests)
- `decision_token` uuid nullable, unique (`idx_requests_decision_token`, partial on `is not null`) — one-click Approve/Decline in the weekend-submitted email. Set by `create_request` and `create_guest_weekend_request` in the same transaction as the insert, for every **registered** and **guest** WEEKEND request routed to a **Dean-authorised** unit (`20261013090000_decision_token_in_create_rpcs.sql`; until then the submit routes minted it after the response in a separate UPDATE, so a failed write sent the Dean's email without its link). For a guest request approval still requires the Dean to pick a key on the confirmation page (`available_keys` in the `GET` response) — the token alone doesn't skip that step, it just moves it off the dashboard. Never set for Administration/CSO-routed requests or WEEKDAY requests. Read by `GET`/`POST /api/public/dean-decision/[token]`; its validity is entirely bounded by `status = 'PENDING_HOD'`, not a separate expiry column
- `letter_url` text nullable (path in the `weekend-letters` bucket to the Dean authorisation letter uploaded at submit — by a guest, or optionally by a registered requester whose submission is compared against the Dean's reference signature at approval)
- `stamp_url` text nullable (path in the `weekend-letters` bucket to a close-up of the departmental stamp, optionally uploaded alongside `letter_url` by a registered requester; compared pixel-level against the Dean's `stamp_ref_url` at approval, independently of the signature check — see `docs/AI.md` §3)
- `requested_room` text nullable (free-text room/area a guest states they need access to; shown to the Dean before key assignment; null for registered-user requests)
- `type` enum: 'WEEKDAY' | 'WEEKEND'
- `requested_for` date (weekday: today; weekend: future Sat/Sun)
- `status` enum: 'PENDING_HOD' (weekend only) | 'APPROVED' (weekend only — Dean approved, awaiting on-the-day code) | 'CODE_ISSUED' | 'KEY_ISSUED' | 'KEY_RETURNED' | 'EXPIRED' | 'CANCELLED' | 'DECLINED'. Confirmed live via `select enum_range(null::request_status)` against production (2026-08-30): `{PENDING_HOD,CODE_ISSUED,KEY_ISSUED,KEY_RETURNED,EXPIRED,CANCELLED,DECLINED,APPROVED}` — exactly these 8 values, nothing else. A prior version of this doc claimed three additional legacy values (`PENDING`, `SUCCESS`, `ERROR`); that claim was simply wrong, not an undocumented deploy gap — there is no `CREATE TYPE`/`ALTER TYPE` for them in any migration, and the live enum confirms they were never applied to production either.
- `code` text (6-digit collection code, only present in CODE_ISSUED state)
- `code_expires_at` timestamptz
- `return_code` text (6-digit return code; set by `request_return` while KEY_ISSUED, cleared on return)
- `return_code_expires_at` timestamptz (15 minutes from generation)
- `reminder_sent_at` timestamptz nullable (when the morning-of weekend collection-code reminder email was sent; claimed by `POST /api/cron/weekend-reminders` with a conditional UPDATE before the email is sent, so neither a retry nor an overlapping run double-emails; cleared again only when the send fails. Since 2026-10-14 it also stays set for a reminder suppressed or with no recipient, meaning "handled", not "delivered")
- `return_deadline` timestamptz
- `risk_tier` enum: 'LOW' | 'MEDIUM' | 'HIGH' (computed at request time)
- `risk_factors` jsonb (array of {rule, description, weight})
- `hod_decision_id` UUID FK hod_decisions (weekend only)
- `issued_by` UUID FK profiles (verifier; nullable until issued)
- `issued_at` timestamptz nullable
- `returned_at` timestamptz nullable
- `created_at` timestamptz
- Constraint `requests_one_requester_kind`: exactly one of `requester_id` / `guest_id` is set (`num_nonnulls(requester_id, guest_id) = 1`)
- Trigger `requests_key_capacity` → `check_key_capacity()` (`20260906120000_key_count_as_capacity.sql`): enforces **at most `keys.key_count` concurrent occupants** of a key. A request _occupies_ one copy while it is `KEY_ISSUED`, or `CODE_ISSUED` with an unexpired code — the predicate is `public.request_occupies_key(status, code_expires_at)`. Raises `NO_KEYS_AVAILABLE` (`P0016` → 409). Fires only when a row **enters** occupancy, so `CODE_ISSUED → KEY_ISSUED` is skipped (the copy was already reserved when the code was minted) and `PENDING_HOD` / `APPROVED` weekend rows never occupy at all. Race-safety comes from locking the `keys` row before counting (lock order requests → keys, matching `issue_key`/`return_key`). `SECURITY DEFINER` is load-bearing: `requests_select` scopes a REQUESTER to their own rows, so a trigger running as the requester would count only their own requests and never fire. Supported by the partial index `idx_requests_occupying_key` on `(key_id) where status in ('CODE_ISSUED','KEY_ISSUED')`
- This replaced the partial unique index `requests_one_live_issue_per_key` (`20260904150000_issue_key_single_holder_guard.sql`, dropped 2026-09-06), which enforced strictly **one** live holder per key. A unique index can express "at most one" but not "at most N", and the `code_expires_at > now()` half of the rule is not immutable so cannot appear in an index predicate at all — hence a trigger, matching the `authorisations_max_three` precedent
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
- `metadata` jsonb — generation provenance and counts (`docs/AI.md`). While a row is still `PENDING_GENERATION`, `POST /api/cron/shift-report` records failed attempts here (`generation_attempts`, `last_generation_error`, `last_attempt_at`), orders by `generation_attempts` and skips a row after 5; a successful generation replaces the object
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
- `shift_id` UUID FK shifts nullable (the open shift at logging time, if any — `20260603062209_incidents_shift_nullable.sql`)
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
- Written only through RPCs: `log_incident`, `mark_key_lost`, and `return_key`'s unverified path. The first two write their audit entry (`INCIDENT_LOGGED` / `KEY_MARKED_LOST`) in the same transaction (`20261013130000_audited_incident_rpcs.sql`); until then `POST /api/incidents` and `POST /api/keys/mark-lost` inserted directly with no audit entry. There is no INSERT policy: `20261014090000_admin_audit_gaps.sql` dropped `incidents_insert_cso_verifier`, which let a CSO or verifier session insert an incident directly, unaudited

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
- `weekend_submitted_email` boolean, default true — Dean and CSO. Gates the `WEEKEND_SUBMITTED` notification: the Dean's for a **Dean-authorised** unit, each active CSO's for an Administration (`authoriser = 'CSO'`) unit. Until 2026-10-13 the CSO path ignored it. All request-email preferences are applied in one place, `src/lib/notifications/rules.ts`.
- `signature_mismatch_email` boolean, default true — CSO. Gates the `SIGNATURE_MISMATCH` notification, sent to every `ACTIVE` CSO opted in when `POST /api/requests/hod-decision` holds an approval on a signature/stamp mismatch (the same event that writes the `SIGNATURE_MISMATCH` audit entry powering the CSO dashboard's live alert feed). Absence of a row means opted in, same convention as `weekend_submitted_email`. There is deliberately no equivalent preference for the risk-alerts/signature-mismatch **in-app** feeds — those are core security-monitoring surfaces, not optional notifications, so nothing gates them.
- `digest_email` boolean, default false — Dean/CSO. See `notification_preferences.digest_email` below.
- `updated_at` timestamptz

### requests.overdue_reminder_sent_at

Added alongside `notification_preferences`. Mirrors `requests.reminder_sent_at` (the weekend-code reminder's idempotency column) but scoped to the overdue-return reminder — that one is queried for `type='WEEKEND', status='APPROVED'` rows specifically, so a second column avoids ambiguity. Claimed (set) before the email is sent, by a conditional UPDATE in `POST /api/cron/overdue-reminders` (since 2026-10-14; previously stamped after sending), and left set for every handled `KEY_ISSUED`/overdue row — sent, suppressed by preference, or with no recipient address (since 2026-10-13; those used to be retried every hour forever) — it means "this cycle was handled," not "an email was delivered." Only a failed send has the stamp cleared again, so the next hour retries it.

### notification_preferences.digest_email

Added for the Dean/CSO "daily digest" tabs. **Defaults to `false`** — the opposite convention from every other column on this table (which default `true`). This is an opt-in enhancement, not a core notification; absence of a row means not opted in for this column specifically.

### pending_signature_references

A held reference-replacement mismatch from `POST /api/profile/signature`, awaiting CSO review. Row existence = held; the row is deleted when the CSO resolves it (via `resolve_pending_signature_reference`). Composite PK means a second mismatched upload before the first is resolved just overwrites the pending row — no stacking. RLS: `SELECT` for CSO only (`public.user_role() = 'CSO'`, same shape as `audit_log`'s CSO-read policy); no write policy for any role — `hold_signature_reference` writes it, and `resolve_pending_signature_reference` or `set_signature_reference` deletes it.

- Composite PK (`profile_id`, `type`)
- `profile_id` UUID FK profiles — the Dean whose reference is pending
- `type` text, `CHECK (type IN ('signature', 'stamp'))`
- `pending_url` text — Storage URL of the new, unverified upload. Since 2026-10-13 every upload goes to its own path (`{uid}/{type}-{uuid}.{ext}`); the old fixed `-pending` path was overwritten by the next held upload even after the CSO had approved it as the live reference
- `current_ref_url` text nullable — snapshot of the reference it was compared against, for display
- `mismatch_pct` numeric
- `threshold_pct` numeric
- `submitted_at` timestamptz

### rate_limit_hits

Hits counted by `check_rate_limit` for the guest weekend-request form's rate limit (`20261019100000_guest_rate_limit.sql`, see `docs/API.md` → `POST /api/public/weekend-request`). One row per accepted hit. RLS enabled with **no policies**, and every grant revoked from `anon` and `authenticated`: only the `SECURITY DEFINER` function and the cleanup job touch it.

- `id` bigint identity PK
- `bucket` text, 1–64 characters — what is being counted (`guest-submit:ip`, `guest-submit:email`)
- `key_hash` text, `CHECK (key_hash ~ '^[0-9a-f]{64}$')` — an HMAC-SHA-256 digest of the client address or email, computed in the route under `RATE_LIMIT_SALT`. The CHECK makes storing a raw IP or email impossible, not just unlikely
- `hit_at` timestamptz default `now()`
- Indexes: `(bucket, key_hash, hit_at)` for the count, `(hit_at)` for the cleanup
- Cleanup: `check_rate_limit` deletes the key's rows that have left the window on every call; the `rate-limit-hits-cleanup` pg_cron job (03:30 UTC daily) deletes every row older than 2 days, which is longer than any window in use (the longest is a day). Raise it if a longer window is added

## RPCs (Postgres functions)

These wrap multi-table mutations in transactions and enforce business rules.

- `create_request(requester_id, key_id, type, return_deadline, weekend_date?, risk_tier?, risk_factors?, letter_url?, stamp_url?)` — **service-only** (since `20261015090000_grant_hardening.sql`); `POST /api/requests/submit` calls it through the admin client and passes the session user as `requester_id`. creates request + audit entry. WEEKDAY returns a code immediately (CODE_ISSUED); WEEKEND creates a PENDING_HOD request with no code, and sets `decision_token` when the key's unit is Dean-authorised. Since `20261013120100_create_request_risk_and_letters.sql` the risk result (`risk_tier`, default `LOW`; `risk_factors`) and a weekend request's `letter_url`/`stamp_url` are written by the same INSERT, and `REQUEST_CREATED` carries `risk_tier`/`risk_factors`. Until then `POST /api/requests/submit` back-filled them with two separate best-effort service-role UPDATEs. A letter or stamp is accepted only on a WEEKEND request and only as an object in the caller's own `weekend-letters/{uid}/` folder (`VALIDATION` otherwise) — the same check the route makes, repeated because the RPC is the boundary. The old 4-argument signature was dropped, and the 8-argument one in `20261015090000`. Until then it was granted to `authenticated` and read the requester from `auth.uid()`, so a requester calling it directly could store its own risk tier; the requester is now a parameter, honoured only because the caller is `service_role` (the session-actor check below still refuses a mismatched user session).
- `cancel_request(request_id)` — requester-only, actor from `auth.uid()`. Cancels the caller's own `CODE_ISSUED` / `PENDING_HOD` / `APPROVED` request → CANCELLED, clears the code, audit `REQUEST_CANCELLED {key_id, previous_status}`. Another requester's request raises `NOT_FOUND` (its existence is not disclosed); any other status raises `CONFLICT`. Granted to `authenticated` (`20261013120000_cancel_and_cso_decision_rpcs.sql`).
- `cso_decide_request(request_id, decision, note?)` — CSO-only, actor from `auth.uid()`. `DECLINED` requires `CODE_ISSUED` (→ CANCELLED, code cleared, audit `REQUEST_DECLINED_CSO`); any other status raises `CONFLICT`. `APPROVED` requires `CODE_ISSUED`/`KEY_ISSUED`, changes nothing, writes `REQUEST_APPROVED_CSO` and returns the real status. The note is recorded in the audit payload. Replaced a route that declined `KEY_ISSUED` requests "successfully" — its UPDATE matched no row but it still wrote `REQUEST_DECLINED_CSO` and answered CANCELLED. Granted to `authenticated`.
- `update_user_profile(profile_id, full_name, unit_id?)` — CSO-only, actor from `auth.uid()`. Renames a user and, for DEAN/REQUESTER, moves their unit (required for those roles, ignored for others). Locks the destination unit before the one-active-Dean-per-unit check (`CONFLICT`), keeps `units.hod_id` in step for a moving Dean, and writes `USER_UPDATED` with only the changed fields — all in one transaction. Granted to `authenticated` (`20261013120200_user_admin_rpcs.sql`).
- `deactivate_user(profile_id)` — CSO-only, actor from `auth.uid()`. Sets `status = DEACTIVATED`, clears any `units.hod_id` pointing at the user, audit `USER_DEACTIVATED {deactivated_by, previous_status}`. Already deactivated → `CONFLICT`. The auth ban is GoTrue's, outside Postgres, so `PATCH /api/admin/users/[id]/revoke` bans first and lifts the ban if this RPC fails (`src/lib/admin/revoke-user.ts`). Granted to `authenticated`.
- `reinstate_user(profile_id, full_name?, unit_id?)` — CSO-only, actor from `auth.uid()`. A `DEACTIVATED` user → `PENDING_ACTIVATION` (anything else → `CONFLICT`), applying an optional name/unit correction (blank or null keeps the stored value; a unit applies to DEAN/REQUESTER only, `VALIDATION` if it does not exist). A Dean is refused (`CONFLICT`) when another `ACTIVE` Dean holds the unit — checked under a lock on the unit — and otherwise becomes `units.hod_id` again, as `provision_user` does. Audit `USER_REINSTATED {reinstated_by, previous_status, status, changes}`. The GoTrue ban is lifted by the route afterwards; if that fails it calls `deactivate_user` to put the profile back (`src/lib/admin/reinstate-user.ts`). Granted to `authenticated` (`20261014090000_admin_audit_gaps.sql`).
- `record_invite_resent(profile_id, full_name?, unit_id?)` — CSO-only, actor from `auth.uid()`. Records a re-sent activation link for a `PENDING_ACTIVATION` user (`ACTIVE` or `DEACTIVATED` → `CONFLICT`), applying the same optional name/unit correction, one-active-Dean check and `units.hod_id` sync as `reinstate_user` when the unit changes. Audit `USER_INVITE_RESENT {resent_by, institutional_email, changes}`. Sends nothing: the route generates the link, calls this, then emails. Returns the stored `role` and `institutional_email` so the route builds the activation link from the profile, not the form. Granted to `authenticated`.
- `create_key(code, zone, room_name, unit_id, key_count?)` — CSO-only, actor from `auth.uid()`. Validates the code (`^[A-Z0-9]+-[0-9]+$`), a non-blank room name, `key_count` 1–20 and the unit (`VALIDATION`), inserts an `AVAILABLE` key and writes `KEY_CREATED {key_id, code, zone, room_name, unit_id, key_count}`. A duplicate code → `CONFLICT`. Called by `POST /api/admin/keys`. Granted to `authenticated`.
- `set_signature_reference(profile_id, type, new_url, compared_ref_url?)` / `hold_signature_reference(profile_id, type, pending_url, compared_ref_url, mismatch_pct, threshold_pct)` — **service-only** (execute revoked from `public`, `anon` and `authenticated`, granted to `service_role`; `20261013120300_signature_reference_rpcs.sql`). `POST /api/profile/signature` verifies a Dean's replacement upload in TypeScript and then calls one of these: `set_…` replaces the reference, deletes any now-stale `pending_signature_references` row for that type, and writes `SIGNATURE_REFERENCE_UPDATED`; `hold_…` upserts the pending row and writes `SIGNATURE_MISMATCH` (`context: 'reference_replacement'`). Both lock the profile and raise `CONFLICT` if the live reference is no longer the one the upload was compared against. Service-only because a Dean session that could call `set_…` would replace its own reference without verification. There is no session actor; the route passes the authenticated Dean's id.
- `generate_weekend_code(request_id, requester_id)` — requester-initiated. On the requested weekend date only, mints a short-lived 6-digit code (10-min expiry) for an APPROVED weekend request → CODE_ISSUED. Audit `CODE_ISSUED`. Raises TOO_EARLY before the date. Session-actor checked (see below); a guest request (`requester_id IS NULL`) is `FORBIDDEN` — until `20261015090000` the `<>` ownership test was NULL for one and let any requester mint a guest's code. Since `20261019090000` a thin wrapper over `_lifecycle_weekend_code`, shared with `generate_guest_weekend_code` (see "Request lifecycle steps" below); a NULL `requester_id` is `FORBIDDEN`.
- `expire_request(request_id, requester_id)` — requester-initiated (fired automatically by the UI when a code lapses). Flips a genuinely-expired CODE_ISSUED request → EXPIRED, clears the code, audit `REQUEST_EXPIRED` — except a weekend request whose requested date is today, which rolls back to APPROVED instead (so a fresh code can be minted) and audits `CODE_EXPIRED`. Idempotent (no-op if already moved on). Session-actor checked; a guest request is `FORBIDDEN`. Since `20261019090000` a thin wrapper over `_lifecycle_expire_code`, shared with `expire_guest_request`.
- `dismiss_expired_request(request_id, actor_id)` — authoriser-initiated. Lets a Dean (own faculty) or the CSO (any) clear a lapsed WEEKEND request out of the pending queue without waiting for the nightly sweep. Only accepts `PENDING_HOD` / `APPROVED` / `CODE_ISSUED` requests whose `requested_for < current_date`; moves them → EXPIRED, clears the code, audit `REQUEST_EXPIRED` with `reason: 'dismissed_by_authoriser'` and the dismissing actor. No `hod_decisions` row — this is housekeeping, not a decision. Authoriser gate mirrors `decline_weekend`. Execute revoked from `public`/`anon`. Session-actor checked since `20261015090000`: until then `actor_id` was taken on trust, so any signed-in user could dismiss as any Dean or the CSO.
- `expire_lapsed_codes()` — batch cleanup, cron-only (execute revoked from `public`/`anon`/`authenticated`). Expires any CODE_ISSUED request (weekday or weekend, registered or guest) whose `code_expires_at < now()` → EXPIRED, clears the code, writes a `REQUEST_EXPIRED` audit entry per row (guest-aware) — except a weekend request whose requested date is today, which rolls back to APPROVED instead and audits `CODE_EXPIRED`, same rollback branch as `expire_request`/`expire_guest_request`. Server-side backstop to the UI-fired `expire_request`: a closed browser tab no longer strands an unclaimed code, so the key frees up for another requester. Scheduled every 10 minutes via `pg_cron`. Idempotent.
- `expire_stale_weekend_requests()` — batch cleanup, cron-only (execute revoked from `public`/`anon`/`authenticated`). Expires WEEKEND requests whose `requested_for < current_date` and status is `PENDING_HOD` / `APPROVED` / `CODE_ISSUED` → EXPIRED, clears the code, writes a `REQUEST_EXPIRED` audit entry per row (guest-aware via `_write_audit_guest`). Without this, a weekend request whose date passes before a code is minted has no lifecycle terminus and permanently blocks re-requesting its key (`generate_weekend_code` raises TOO_EARLY once the date is past; `create_request` treats any non-terminal status as active). Scheduled daily at 00:15 UTC via `pg_cron` calling the function directly. Idempotent.
- `issue_key(request_id, verifier_id)` — flips request status, sets issued_at, audit entry. Refuses (`CONFLICT`, `P0006`, → 409) when the room's keys are all already out, i.e. `count(KEY_ISSUED for this key) >= keys.key_count`. This is the **physical** invariant at handover, distinct from the reservation the `requests_key_capacity` trigger enforces — the trigger deliberately skips the `CODE_ISSUED → KEY_ISSUED` transition, so the two do not overlap. In practice it is unreachable through normal paths (a `CODE_ISSUED` row already holds its copy) and is kept as defence in depth plus verifier-facing copy; `supabase/tests/05_weekday_lifecycle_test.sql` has to disable the trigger to construct the state at all. Locks the `keys` row first (lock order requests → keys, matching `return_key`). Also sets `keys.status = 'ISSUED'` **only when this collection exhausts the room's copies** — that column means "exhausted or not", since a single scalar cannot express "3 of 12 out". For counts, read `get_key_occupancy()` instead of `keys.status`. Since `20261015090000` the verifier must be the session user and a `VERIFIER` (`FORBIDDEN: only a VERIFIER can issue keys`); before, neither was checked, so a requester could issue their own code.
- `request_return(request_id, requester_id)` — requester-initiated; generates a 6-digit return code (15-min expiry) for their own KEY_ISSUED request, audit entry (`RETURN_CODE_GENERATED`). Status stays KEY_ISSUED. Session-actor checked; a guest request is `FORBIDDEN` (the `<>` ownership test used to pass for one). Not `KEY_ISSUED` → `NOT_ISSUED` (`P0009`). Since `20261019090000` a thin wrapper over `_lifecycle_return_code`, shared with `request_return_guest`; its ownership refusal now reads `FORBIDDEN: not your request` like the other two steps (was `… request does not belong to the caller`).
- `return_key(request_id, verifier_id, code?, returner_id?, override_reason?)` — flips request status to KEY_RETURNED, sets returned_at, clears the return code. Requires either `code` (verified → `KEY_RETURNED`) or `override_reason` (unverified → `KEY_RETURNED_UNVERIFIED` + a `SUSPICIOUS_ACTIVITY` incident when an open shift exists). Since `20260906120000_key_count_as_capacity.sql` it **recomputes** `keys.status` from whoever is still holding a copy — `OVERDUE` if any remaining holder is past their deadline, else `ISSUED` if still exhausted, else `AVAILABLE` — rather than writing `AVAILABLE` unconditionally. That also fixed a smaller pre-existing bug: it used to clear an `OVERDUE` key to `AVAILABLE` regardless. Since `20261015090000` the verifier must be the session user and a `VERIFIER`.
- `mark_key_lost(key_id, note)` — CSO-only, actor from `auth.uid()`. Locks the key row; unknown key → `NOT_FOUND`, already `RETIRED` → `CONFLICT`, blank note → `VALIDATION`. Sets `status = RETIRED` + `retired_at`, inserts a `MISSING_KEY`/`HIGH`/`OPEN` incident (description = note, `related_key_id`, filed against the most recently started open shift if any), and writes `KEY_MARKED_LOST {key_id, key_code, previous_status, incident_id, incident_reference, note, open_requests}` — one transaction. It does not refuse a key someone still holds (the route never did); `open_requests` counts the requests occupying a copy (`request_occupies_key`) so the CSO can see it. Returns `(key_id, incident_id, reference)`. Called by `POST /api/keys/mark-lost` (`20261013130000_audited_incident_rpcs.sql`). Granted to `authenticated`.
- `log_incident(type, severity, description, occurred_at, related_key_id?, related_person_id?)` — CSO or VERIFIER, actor from `auth.uid()`. Blank description or a null type/severity/occurred_at → `VALIDATION`. Inserts an `OPEN` incident against the open shift if any (the DB generates `reference`) and writes `INCIDENT_LOGGED {incident_id, reference, type, severity, related_key_id, related_person_id}` in the same transaction. Returns `(incident_id, reference)`. Called by `POST /api/incidents`. Granted to `authenticated`.
- `approve_weekend(request_id, hod_id, note?, signature_verified?, signature_mismatch_pct?, cso_override?)` — authoriser-aware: for an `authoriser='DEAN'` (faculty) key the actor must be that faculty's Dean; for an `authoriser='CSO'` (Administration) key the actor must be the CSO (no unit match, signature verification skipped). Creates hod_decisions row, moves request to APPROVED (no code is issued here — the requester mints one on the day via `generate_weekend_code`), audit entry. (Signature verification for the Dean path runs in TypeScript before this is called.) `cso_override` lets the CSO approve a held faculty-key request in place of the Dean, but only when a `SIGNATURE_MISMATCH` audit entry already exists for that request — enforced in the function body, not just the route. **Service-only** since `20261015090000`: it was granted to `authenticated` and never compared `hod_id` (or the caller-supplied `signature_verified`) with the session, so any signed-in user could approve as any Dean. `decideWeekend` calls it through the admin client.
- `decline_weekend(request_id, hod_id, note?, cso_override?)` — authoriser-aware actor gate (same Dean-vs-CSO branch on the request's effective unit — key's for registered, `requested_unit_id` for guests). Creates hod_decisions row, audit entry. `cso_override` mirrors `approve_weekend`'s. Service-only since `20261015090000`, for the same reason.
- `nominate_collector(key_id, requester_id)` / `remove_collector(key_id, requester_id)` — authoriser-aware: the Dean for faculty keys (unit must match), CSO for `authoriser='CSO'` Administration keys. Enforce the max-3-slots and no-duplicate rules, audit entry.
- `mark_key_overdue()` — batch cleanup, cron-only. Flips `keys.status` to `OVERDUE` for every key whose issued request is `KEY_ISSUED` with `return_deadline < now()`, writing a `KEY_OVERDUE` audit entry per key (actor: the earliest-created active CSO profile). Its idempotence guard used to be `keys.status <> 'OVERDUE'`; since `20260906120000_key_count_as_capacity.sql` it is per-**request** (`not exists (… audit_log where event = 'KEY_OVERDUE' and payload->>'request_id' = r.id)`, backed by `idx_audit_log_key_overdue_request`). With several people holding copies of one key, the per-key guard let the first overdue holder flip the shared `keys.status` and then silently swallowed every other overdue holder's audit entry. If no ACTIVE CSO exists no entry is written and the row is reprocessed next run — the only effect is a repeated idempotent UPDATE. Scheduled hourly via `pg_cron` calling the function directly. (An `overdue-key-check` Edge Function used to wrap this RPC; it was never what `pg_cron` invoked after `20260622140052_cron_jobs_direct_sql.sql`, and was removed on 2026-08-04.) Returns `updated_count`. Execute was granted to `authenticated` (confirmed live 2026-08-30) despite "cron-only"; `20261015090000_grant_hardening.sql` revokes it from `public`/`anon`/`authenticated` and grants `service_role`. `pg_cron` runs it as `postgres`. Since `20260812110000_requester_notifications.sql`, the same `overdue-key-check` cron job also calls `POST /api/cron/overdue-reminders` (over `pg_net`/HTTP, reusing the `weekend_cron_secret` Vault secret) right after this function — sending email is not something plpgsql can do directly, so unlike this function the reminder job has to go through the Node runtime.
- `schedule_pending_shift_report()` — batch cleanup, cron-only. Finds the most recently started shift with no `shift_reports` row, inserts a placeholder row (`markdown = 'PENDING_GENERATION'`), and writes a `SHIFT_REPORT_SCHEDULED` audit entry (actor: the earliest-created active CSO profile). No-ops if every shift already has a report. Scheduled daily at 18:00 UTC via `pg_cron` calling the function directly (`daily-shift-summary` job — the job name outlived the Edge Function of the same name, removed 2026-08-04). Execute is revoked from `anon` and `authenticated`, so this one is genuinely cron-only. The placeholder is distinct from `generate_shift_report`'s row: this RPC alone does not complete report generation — the same `daily-shift-summary` job goes on to call `POST /api/cron/shift-report` over `pg_net`/HTTP (`20260904103000_shift_report_cron_generation.sql`, reusing the `weekend_cron_secret` Vault secret), which fills in the placeholder's `markdown`/`timeline`/`metadata`. Calling Gemini is not something plpgsql can do, so the generation half has to go through the Node runtime — the same split as `mark_key_overdue()` and its reminder route. **Until 2026-09-04 nothing filled the placeholder at all**: the CSO-facing `POST /api/reports/generate` refused any shift that already had a row, so every scheduled report sat permanently on "still generating" (5 of 9 live rows). That route now adopts a `PENDING_GENERATION` row instead of raising `CONFLICT`.
- `get_digest_stats(unit_id?, since?)` — read-only, cron-only (execute revoked from `public`/`anon`/`authenticated`, same pattern as `expire_lapsed_codes()`). Returns 8 activity counts since `since` (default last 24h): keys issued/returned, **holders currently overdue** (`overdue_count` — since `20261013110000_key_occupancy_rpc.sql` it counts `KEY_ISSUED` requests for which `request_is_overdue` is true, not key records with `keys.status = 'OVERDUE'`; a twelve-copy room with three late holders reports 3, and an overdue holder counts from the deadline rather than after the hourly cron), weekend requests submitted/pending, and 3 building-wide-only fields (high-risk requests, signature mismatches, incidents) that a Dean call simply doesn't read. `unit_id = null` means building-wide (CSO); a real unit id scopes to that faculty (Dean). Called by `POST /api/cron/daily-digest`, itself called by the `daily-digest` pg_cron job (07:00 UTC daily, same `pg_net`/Vault-secret pattern as `weekend-code-reminders`).
- `request_is_overdue(status, return_deadline)` — `language sql stable`. **The** overdue rule: `status = 'KEY_ISSUED'` and `return_deadline` is set and `< now()`. Sits beside `request_occupies_key(status, code_expires_at)` (the occupancy rule the `requests_key_capacity` trigger uses). Added in `20261013110000_key_occupancy_rpc.sql`; execute revoked from `public`/`anon`, granted to `authenticated` and `service_role` (the digest runs as service role). `return_key` and `mark_key_overdue` were deliberately **not** recreated to call it — their inline predicate already is this rule. TypeScript mirrors both predicates in `src/lib/keys/occupancy.ts` (`occupiesKey`, `isOverdue`); the truth tables in `src/tests/keys/occupancy.test.ts` and `supabase/tests/11_key_occupancy_test.sql` carry the same labels and must change together.
- `get_key_occupancy(zone?)` — read-only, `SECURITY DEFINER`, CSO/VERIFIER only (`NOT_AUTHENTICATED` → `P0001` with no session; `FORBIDDEN` → `P0002` for any other role). One row per key (optionally one zone): `key_id, zone, unit_id, key_count, retired, issued, overdue, reserved, occupied, available`. `issued` counts copies physically out (overdue included), `overdue` the subset past their deadline, `reserved` copies held by a live collection code, `occupied = issued + reserved`, `available = greatest(0, key_count - occupied)` — or 0 when retired. Counts **copies**, not key records, so it is the source for the CSO dashboard zone chart (`summariseByZone`) and `GET /api/admin/units` `has_slot_today`, both of which used to read `keys.status`. Execute revoked from `public`/`anon`, granted to `authenticated`.

> **Fix (2026-08-12, `20260812140000_fix_pg_net_schema.sql`)**: every `pg_net`-based cron job (`weekend-code-reminders`, `overdue-key-check`'s HTTP call, `daily-digest`) called `extensions.http_post`, which does not exist — `pg_net`'s functions live in the `net` schema regardless of the `create extension pg_net with schema extensions` clause in the original `weekend-code-reminders` migration (a no-op; `pg_net` was already installed in `net` by Supabase's own bootstrap). Confirmed via `cron.job_run_details`: **`weekend-code-reminders` had failed every run since creation (2026-07-11 onward, every Sat/Sun) — no weekend collection-code reminder email had ever actually been sent.** All three jobs now call `net.http_post` with `timeout_milliseconds := 25000` (up from the 5000ms default, too tight for a route doing several DB round trips plus an SMTP send).

- `acknowledge_shift_handover(outgoing_shift_id, key_ids, bulk)` — creates handover row, audit entry per key.
- `generate_shift_report(shift_id)` — server-side; calls Gemini, inserts shift_reports row, audit entry.
- `add_report_comment(report_id, text)` — inserts immutable comment, audit entry.
- `provision_user(name, email, role, department_id?)` — creates profile, generates activation token, queues email, audit entry.
- `update_risk_config(rules, medium_min, high_min)` — CSO-only. `rules` is a JSON array of exactly 5 `{rule_key, weight, enabled}` objects, one per `risk_rule_key`. Updates `risk_rule_config` and the `risk_tier_config` singleton in one transaction, writes one `RISK_CONFIG_UPDATED` audit entry (not one per rule). Raises `INVALID_TIER_BOUNDS` if `high_min <= medium_min`, `INVALID_RULES` if `rules` isn't exactly 5 entries or contains an unknown `rule_key`.
- `update_operational_config(zone_hours, return_deadline_time, code_expiry_minutes)` — CSO-only. `zone_hours` is a JSON array of exactly 2 `{zone, weekday_open, weekday_close, weekend_closed, weekend_open, weekend_close}` objects, one per `public.zone` value. Updates `zone_hours` and the `operational_config` singleton in one transaction, writes one `OPERATIONAL_CONFIG_UPDATED` audit entry. Raises `INVALID_ZONE_HOURS` for a bad/incomplete zone entry (open ≥ close, or missing weekend hours while not closed) and `INVALID_CONFIG` for an out-of-range `code_expiry_minutes` or a null `return_deadline_time`. `create_request`, `generate_weekend_code`, and `generate_guest_weekend_code` all read `code_expiry_minutes` from here instead of each hardcoding their own expiry.
- `check_rate_limit(bucket, key, limit, window)` — **service-only** (revoked from `public`/`anon`/`authenticated`, granted to `service_role`), `SECURITY DEFINER`. Takes a transaction advisory lock on `(bucket, key)`, deletes that key's rows older than `window`, counts the rest, and either records a hit and returns `0` (under `limit`) or records nothing and returns the seconds until enough hits leave the window (at or over it). Concurrent calls for one key therefore cannot both slip in at the limit, and a refused caller does not push their own window out. `VALIDATION` (`P0004`) for a null argument, `limit < 1` or a non-positive window. No audit entry: it is a counter, not an action. Called by `POST /api/public/weekend-request` through `src/lib/http/rate-limit.ts`.
- `resolve_pending_signature_reference(profile_id, type, decision, note?)` — CSO-only. Resolves a `pending_signature_references` row: on `'APPROVED'`, sets `profiles.signature_ref_url`/`stamp_ref_url` (whichever `type` says) to the pending upload's URL and writes a `SIGNATURE_REFERENCE_UPDATED` audit entry (`resolved_by_cso: true`); on `'DECLINED'`, writes a `SIGNATURE_REFERENCE_DECLINED` entry with no profile change. Either way the pending row is deleted first. Raises `NOT_FOUND` if no pending row exists for that `profile_id`/`type`, `INVALID_DECISION` for a bad `type`/`decision` value.

### External (guest) weekend RPCs

Guest analogues of the registered-user weekend flow. All are `SECURITY DEFINER`, key on an unguessable `access_token` instead of `auth.uid()` (guests have no session), and have execute revoked from `anon`/`public` — they are called only from server-side routes via the service-role admin client. `issue_key` is reused unchanged for the desk collection step.

- `_write_audit_guest(event, target_type, target_id, actor_name, payload)` — audit chokepoint for actions with no profile actor. Mirrors `_write_audit` but records `actor_id`/`actor_role` null and the plain guest `actor_name` (e.g. `'Jane Doe'`); callers set `payload->>'external' = true` as the discriminator.
- `create_guest_weekend_request(full_name, email, phone, id_type, id_number, department_id, weekend_date, return_deadline, letter_url, requested_room)` — inserts a `guest_requesters` row + a WEEKEND request (`PENDING_HOD`, no code, `access_token` minted, and `decision_token` when the unit is Dean-authorised), audit `REQUEST_CREATED`. Returns `{request_id, access_token}`.
- `approve_guest_weekend(request_id, hod_id, key_id, note?)` — authoriser-aware: validates the chosen key belongs to a group the actor authorises (the Dean's own unit, or any Administration key when the actor is the CSO), sets `key_id`, creates the `hod_decisions` row, moves the request → APPROVED, audit `HOD_APPROVED`. Service-only since `20261015090000` (was granted to `authenticated` with `hod_id` taken on trust). (No signature verification — the approver reviews the uploaded letter manually.)
- `generate_guest_weekend_code(access_token)` — on `requested_for = current_date` only, mints a code (operational_config expiry, default 10 min) → CODE_ISSUED, audit `CODE_ISSUED`. Raises TOO_EARLY before the date. Since `20261019090000` a thin wrapper: `_resolve_guest_request` then `_lifecycle_weekend_code`, the same implementation as `generate_weekend_code`.
- `expire_guest_request(access_token)` — flips a genuinely-expired CODE_ISSUED request → EXPIRED, clears the code, audit `REQUEST_EXPIRED` — except a weekend request whose requested date is today, which rolls back to APPROVED instead and audits `CODE_EXPIRED`. Idempotent. Since `20261019090000` a thin wrapper over `_lifecycle_expire_code`, the same implementation as `expire_request`.
- `request_return_guest(access_token)` — guest analogue of `request_return`. For the guest's own `KEY_ISSUED` request, generates a 6-digit return code (15-min expiry), writes it to `return_code`/`return_code_expires_at`, and writes a `RETURN_CODE_GENERATED` audit entry. Status stays `KEY_ISSUED`. Raises `NOT_FOUND` if the token doesn't resolve to a request, `NOT_ISSUED` (`P0009`) if the request isn't `KEY_ISSUED` — `CONFLICT` (`P0006`) until `20261019090000`, which made it a thin wrapper over `_lifecycle_return_code`, the same implementation as `request_return`. Called by `POST /api/public/weekend-request/[token]/return-code`.

### Request lifecycle steps (2026-10-19)

`20261019090000_merge_guest_registered_lifecycle.sql`. Three steps a holder takes on their own request existed twice, once per requester kind, and had drifted (the table is in `docs/CHANGELOG.md` 2026-10-19). Each now has one implementation:

| Step           | Implementation            | Registered wrapper      | Guest wrapper                 |
| -------------- | ------------------------- | ----------------------- | ----------------------------- |
| Weekend code   | `_lifecycle_weekend_code` | `generate_weekend_code` | `generate_guest_weekend_code` |
| Return code    | `_lifecycle_return_code`  | `request_return`        | `request_return_guest`        |
| Expire a code  | `_lifecycle_expire_code`  | `expire_request`        | `expire_guest_request`        |

- **The step** takes `(request_id, actor_id)`, where `actor_id` is the registered requester or `NULL` for the guest who holds the request. It locks the row and checks the actor holds it (`_lock_lifecycle_request`: `NOT_FOUND` `P0007`; `FORBIDDEN: not your request` `P0010` for a registered actor on someone else's or a guest request, or a NULL actor on a registered request), checks the state, writes, and records exactly one audit entry through `_write_lifecycle_audit` — `_write_audit` with the requester's role for a registered actor, `_write_audit_guest` with the plain guest name (fallback `'Guest'`) and `external: true` added to the payload for a guest. Every function has one final `return query`; the expire step's idempotent branch falls through to it.
- **The wrappers** keep their names, signatures, return types, `SECURITY DEFINER` and grants. A registered wrapper runs `_assert_session_actor(requester_id)`, refuses a NULL requester (`FORBIDDEN`, so a trusted caller cannot make itself "the guest"), and calls the step with that requester. A guest wrapper resolves the `access_token` with `_resolve_guest_request` (`NOT_FOUND: request does not exist`, without the token) and calls the step with a NULL actor.
- **The six internal functions** (`_resolve_guest_request`, `_lock_lifecycle_request`, `_write_lifecycle_audit`, and the three steps) are `SECURITY INVOKER`, `set search_path = public`, and executable by none of `anon`, `authenticated` or `service_role`; they run as the function owner inside the definer wrappers.
- **Not merged**: `expire_lapsed_codes()` (cron) still carries its own copy of the expire branch, with `reason: 'code_lapsed'` in the payload and the holder as actor. It agrees with the step today; folding it in would need a reason parameter on the step.
- **Tests**: `supabase/tests/18_lifecycle_parity_test.sql` drives every state each step distinguishes through both wrappers and asserts the same outcome. The TypeScript side is one module too: `src/lib/requests/lifecycle.ts` (`docs/API.md` §2, "Request lifecycle steps").

## Backup and retention

> **Deploy gap closed (2026-08-30)**: `20260820120000_audit_export_state.sql` and
> `20260820120100_audit_log_export_cron.sql` were applied directly to production via the
> Supabase MCP server — `audit_export_state` now exists live and the `audit-log-export`
> pg_cron job is registered and active, confirmed via `list_migrations`/`cron.job`. Not yet
> verified: whether `BLOB_READ_WRITE_TOKEN` is configured in the Vercel environment —
> `POST /api/cron/audit-export`'s first real run will fail with `500` if it isn't.

`audit_log` is exported daily to Vercel Blob — storage genuinely outside the Supabase project, so the evidentiary record no longer shares a single failure domain with the database it documents. This is additive durability, not a retention/deletion policy: `audit_log` stays append-only and immutable in Postgres forever (a TTL that deleted rows was considered and rejected — it would defeat the audit trail's purpose and require bypassing the RLS immutability guarantee for every role including service).

- **`audit_export_state`**: a singleton watermark table (`last_exported_through`) tracking export progress. `audit_log` itself can never record its own export status — RLS denies UPDATE/DELETE for every role — so progress lives in this separate table instead. RLS-enabled with no policies (default-deny for `anon`/`authenticated`); only the service-role admin client touches it.
- **`POST /api/cron/audit-export`**: reads the watermark, exports every fully-completed UTC calendar day since it as newline-delimited JSON to `audit-log/YYYY-MM-DD.ndjson` in Vercel Blob (`access: 'private'`), then advances the watermark one day at a time so a mid-run failure only loses progress on the day that failed. Capped at 20,000 rows per invocation — fine at pilot scale, revisit if that ever binds.
- **`audit-log-export` pg_cron job**: daily at 02:00 UTC, same `net.http_post` + `weekend_cron_secret` Vault-secret pattern as the other three cron jobs (see `20260820120100_audit_log_export_cron.sql`). The watermark defaults to year 2000, so the first run backfills the whole table — trigger that one manually if the table has grown enough to risk the 25s cron timeout.

`shift_reports` durability remains an open gap — not covered by this export, and not yet decided.

## Security and performance hardening (2026-08-30)

A live Supabase advisor sweep (`get_advisors`, both `security` and `performance`) found several
findings from schema drift, not the original design. Fixed via 5 migrations applied directly to
production and backfilled into `supabase/migrations/`:

- **`approve_weekend`/`decline_weekend` were callable by `anon`.** `20260701120000_cso_signature_override.sql`
  recreated both via `CREATE OR REPLACE FUNCTION` to add `p_cso_override` — a new function object,
  which reacquires Postgres's default `PUBLIC` execute grant regardless of the earlier blanket
  `REVOKE EXECUTE ... FROM anon` (`20260610111721`). `REVOKE ... FROM anon` alone does not undo a
  `PUBLIC` grant; only an explicit `REVOKE ... FROM PUBLIC` does — confirmed via
  `has_function_privilege('anon', ...)` before and after. Internal role checks inside both
  functions would have rejected an unauthenticated actor regardless, but there was no reason to
  let `anon` reach a `SECURITY DEFINER` function at all.
- **`user_department_id()` dropped.** Reintroduced in `20260627111159_rename_departments_to_units.sql`
  as a temporary backwards-compat alias for the renamed `user_unit_id()`, explicitly scoped to "the
  window between this migration and the frontend deploy" — that window closed months ago and no
  application code referenced it. It also carried the same implicit-`PUBLIC`-grant gap as above
  (anon-executable) and had no `search_path` pinned (a `SECURITY DEFINER` search-path-hijack
  vector). Dropping it closed both at once rather than just tightening its grants.
- **`user_unit_id()`** now has `search_path = public` pinned, matching `approve_weekend`/`decline_weekend`.
- **`idx_requests_guest_id`** added — `requests.requests_guest_id_fkey` had no covering index.
- **5 RLS policies** (`notification_preferences` ×3, `profiles_update`, `guest_requesters_select_hod`)
  rewritten to wrap `auth.uid()` in `(select auth.uid())` so Postgres caches it once per query
  instead of re-evaluating per row. Logic unchanged.
- **Duplicate permissive SELECT policies consolidated**: `guest_requesters`' three SELECT policies
  → one (`guest_requesters_select`); `requests`' two SELECT policies → one (`requests_select`).
  Predicates OR'd together verbatim from the originals — access control is unchanged, only policy
  count.
- **Not fixed (no tool access)**: Supabase Auth's "leaked password protection" (HaveIBeenPwned
  check) is still disabled — that's an Auth dashboard setting, not a migration.

A follow-up pass while scoping `supabase/tests/` coverage found a real authorisation gap in
**`approve_guest_weekend`** (`20260830103000_fix_approve_guest_weekend_unit_check.sql`): it
checked that the acting Dean/CSO owns the assigned key's unit, but never checked that the
assigned key's unit matches `requests.requested_unit_id` — the unit the guest actually requested
access within. At the RPC layer (the authoritative boundary for a `SECURITY DEFINER` function,
since it bypasses RLS) this let a Dean approve a guest request routed to a _different_ faculty by
assigning a key from their _own_ faculty instead. Not reachable through the current UI —
`POST /api/requests/hod-decision` does an RLS-scoped `SELECT` before calling the RPC, and
`requests_select` blocks a Dean from seeing another faculty's guest request — but the RPC
shouldn't rely on that as its only enforcement. Added the missing check; regression-tested in
`supabase/tests/06_guest_weekend_lifecycle_test.sql`.

## Grant and actor hardening (2026-10-15)

`20261015090000_grant_hardening.sql`. Several RPCs granted to `authenticated` trusted values the caller chose:

| RPC                                                                                                                             | Grant before → after                                             | Actor check before → after                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `create_request`                                                                                                                | `authenticated` → `service_role`                                 | `auth.uid()`, risk tier caller-chosen → `p_requester_id` from the route (admin client) + session-actor check |
| `approve_weekend`, `decline_weekend`, `approve_guest_weekend`                                                                   | `authenticated` → `service_role`                                 | `p_hod_id` on trust → unchanged body; only `decideWeekend` (admin client) can call                           |
| `dismiss_expired_request`                                                                                                       | `authenticated` (+ `service_role`)                               | `p_actor_id` on trust → session-actor check                                                                  |
| `issue_key`, `return_key`                                                                                                       | `authenticated` (+ `service_role`)                               | `coalesce(auth.uid(), p_verifier_id)`, no role check → session-actor check + must be `VERIFIER`              |
| `request_return`, `generate_weekend_code`, `expire_request`                                                                     | `authenticated` (+ `service_role`)                               | `auth.uid()` but `<>` passed a guest request → session-actor check + `is distinct from`                      |
| `mark_key_overdue`, `expire_lapsed_codes`, `expire_stale_weekend_requests`, `schedule_pending_shift_report`, `get_digest_stats` | `mark_key_overdue` had `authenticated` → all `service_role` only | cron-only                                                                                                    |

The **session-actor check** is `_assert_session_actor(actor)` (not executable by any API role): a `service_role` caller, or a direct database connection with no `request.jwt.claims` (pg_cron, migrations, pgTAP), names the actor itself; a caller with claims but no `sub` (anon) is `NOT_AUTHENTICATED`; otherwise the actor must equal `auth.uid()` (`FORBIDDEN: actor does not match the session`, `P0002`).

Write policies that let a user session skip an audited RPC were dropped — no application code wrote these tables from a session: `keys_update_cso`, `departments_insert_cso` / `_update_cso` / `_delete_cso` (on `units`), `authorisations_insert_hod_dept` / `_delete_hod_dept` (bypassed `nominate_collector` / `remove_collector`), and `requests_insert_requester` (bypassed `create_request` entirely — a requester could insert a `CODE_ISSUED` row with a code and risk tier of their choosing). `keys`, `units`, `authorisations` and `requests` now have SELECT policies only. Write policies that remain on other tables are deliberate: `profiles_update` (`full_name` only, column guard), `notification_preferences` (self-service), and the `*_denied` policies.

### Storage buckets (2026-08-30)

`passport-photos` and `hod-signatures` were public buckets until
`20260830140000_private_storage_buckets.sql`. Both are now private, and every read goes through
`GET /api/storage/object`, which authorises per request against the caller's session (see
`docs/API.md` §7a). `weekend-letters` has been private since it was created.

Two things mattered here beyond the flag itself:

- **A public bucket bypasses RLS on read.** The `hod_signatures_select_authenticated` and
  `passport_photos_select_authenticated` policies (from `20260605143804_storage_rls_policies.sql`)
  each granted _every_ authenticated user _every_ object in the bucket. While the buckets were
  public those policies were dormant; flipping `public = false` would have promoted them to the
  live authorisation rule, leaving any signed-in requester able to download any Dean's reference
  signature straight from the Storage API.
- **The bucket flag does not purge the CDN.** Public objects are served
  `cache-control: public, max-age=3600` and cached at the Supabase edge, so an object fetched
  while its bucket was public keeps answering anonymous GETs (`cf-cache-status: HIT`) until that
  copy expires — up to an hour after the flip. Uncached objects are denied immediately. A `HEAD`
  bypasses the cache and returns 400, so `curl -I` will report the bucket private while a real
  GET still serves the image. Re-uploading an object purges its cached copy. Nothing purges a
  copy someone already downloaded: an exfiltrated reference signature has to be re-onboarded.
- **Policies are now one per bucket** (`20260830213933_consolidate_storage_select_policies.sql`).
  Production also carried uncommitted `*_select` policies, so `20260830140000`'s additions were
  near-duplicates; and two `weekend-letters` policies from `20260612101316` did not scope at all
  — `weekend_letters_select_own` checked only that the caller was a REQUESTER, letting any
  requester read every letter in the bucket, and `weekend_letters_select_hod` gave every Dean
  cross-faculty read. The current set is: `hod-signatures` → owning Dean + CSO;
  `passport-photos` → subject + CSO/VERIFIER; `weekend-letters` → uploading requester + CSO,
  with `weekend_letters_insert_requester` scoped to the caller's own folder.
- **The application does not rely on those policies.** Reads go through the service-role admin
  client inside the proxy route, which bypasses RLS and applies its own per-role check. The
  tightened policies are defence in depth for direct Storage API access with a user token.

**Replaced signature and stamp files are kept, deliberately.** Each Dean upload gets its own path, so replacing a reference (or a CSO approving or declining a held one) leaves the previous object in `hod-signatures`. They are not deleted because `SIGNATURE_MISMATCH` audit entries and the CSO mismatch view point at those exact objects (`ref_url`, `submitted_url`, `pending_url`): deleting one would remove the evidence a held approval or replacement was judged on, from an audit trail that is otherwise immutable. The only file removed is an upload that nothing references, when `set_signature_reference`/`hold_signature_reference` refuses it. Volume is a few small images per Dean.

Uploads are unaffected — the `*_insert_own` / `*_update_own` policies were already folder-scoped to
`auth.uid()`, and the public flag never governed writes.

Object URLs are still stored in `profiles.photo_url` / `signature_ref_url` / `stamp_ref_url`,
`requests.letter_url` / `stamp_url`, `pending_signature_references.pending_url` /
`current_ref_url`, and inside `audit_log` payloads in their canonical
`/storage/v1/object/public/...` form. That form is no longer directly fetchable, which is
deliberate: it stays the durable identifier, and
`src/lib/storage/object-url.ts` resolves it — to a proxy URL for browsers
(`toProxyUrl`, `rewriteStorageUrls`) or to bytes for server-side verification
(`downloadStorageObject`). No data migration was needed.

### Upload content types (2026-10-14)

Until 2026-10-14 every upload stored the content type the client declared, and
`GET /api/storage/object` served each object inline under that stored type. A requester's
`image/svg+xml` passport photo, or a Dean's valid PNG labelled `text/html`, therefore ran
script on the app's origin when opened directly. Three layers now close that:

- **Upload**: every route that writes to a bucket detects the type from the file's bytes
  (`src/lib/storage/upload-type.ts`: PNG, JPEG, WebP, and PDF for weekend letters only) and
  stores that content type and extension. SVG is refused everywhere. The requester's weekend
  letter and stamp are uploaded from the browser, so `POST /api/requests/submit` reads them
  back and refuses anything that is not a raster image.
- **Bucket** (`20261014110000_bucket_mime_types.sql`): `allowed_mime_types` is
  `image/png, image/jpeg, image/webp` on `passport-photos` and `hod-signatures`, plus
  `application/pdf` on `weekend-letters`; `file_size_limit` is 5 MB on all three. Storage
  checks the declared type, so this stops an upload that openly declares SVG or HTML (from
  any client, service role included) but not one whose bytes lie. Apply it after, or together
  with, the application deploy: the previous guest route stored `image/jpg`, which the list
  refuses.
- **Serve**: `GET /api/storage/object` ignores the stored type and sniffs the bytes. Raster
  images are served inline; a PDF or anything unrecognised is an attachment
  (`application/pdf` / `application/octet-stream`); every response carries a
  `default-src 'none'; …; sandbox` CSP and `nosniff` (`docs/API.md` §7a). This is what
  protects objects stored before the fix: their `metadata.mimetype` may still be anything.

Objects stored before the fix keep their declared type in `storage.objects.metadata`. The
proxy no longer trusts it, but the Supabase signed URLs used for weekend letters
(`GET /api/requests/[id]/letter`, the one-click Dean page) are served by Supabase under the
stored type, on Supabase's origin. See `docs/CHANGELOG.md` 2026-10-14 for the query that
lists objects stored under anything but the four accepted types.

## Migrations workflow

1. Create migration: `supabase migration new <name>`.
2. Write SQL.
3. Update RLS policies if any new table or column.
4. Update generated TS types: `bun run db:types`.
5. Apply locally: `bun run db:migrate`.
6. Update `docs/DATABASE.md` and `docs/CHANGELOG.md`.
