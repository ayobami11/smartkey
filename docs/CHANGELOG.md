# Changelog

Record material changes to the project so Claude has historical context for "why is this like this?" questions.

## Format

Each entry: date, brief title, what changed, why.

## Entries

### 2026-08-02 — Docs sync: reference docs vs live schema

- **Why**: `docs/DATABASE.md`, `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/PRODUCT.md`, and `CLAUDE.md` had drifted from the live `smartkey` Supabase project. Two structural migrations were never back-ported into the docs: the 2026-06-26 `HOD` → `DEAN` role-enum rename (see that entry below) and the 2026-06-27 `departments` → `units` table/column rename (`20260627111159_rename_departments_to_units.sql`, not previously logged here). Verified directly against the live project via the Supabase MCP server (`list_tables`, function/enum introspection queries).
- **`user_role` enum**: docs said `'CSO' | 'HOD' | 'VERIFIER' | 'REQUESTER'`; the live enum is `'CSO' | 'DEAN' | 'VERIFIER' | 'REQUESTER'`. Only identifiers (`hod_decisions`, `HOD_APPROVED`/`HOD_DECLINED`, the `hod-decision` route, RPC params like `hod_id`/`p_department_id`) still carry the old name — the enum value itself does not.
- **`departments` → `units`**: the table is `units`; `profiles.department_id` → `unit_id`, `keys.department_id` → `unit_id`, `requests.requested_department_id` → `unit_id`. The `department_authoriser` enum type, `authorisations`/`hod_decisions` internals, and RPC parameter names (`p_department_id`) were deliberately left unrenamed by the migration and are documented as such rather than "fixed" to `unit`.
- **Undocumented columns added**: `keys.key_count` (int, default 1, from the 2026-06-25 faculty/Administration remodel) and `profiles.activation_token` (from `provision_user`) — both existed in the DB but were missing from `docs/DATABASE.md`.
- **Undocumented RPCs added to `docs/DATABASE.md`**: `mark_key_overdue()` (hourly `pg_cron`, flips overdue keys — the `overdue-key-check` Edge Function in `supabase/functions/` wraps the same RPC but `pg_cron` calls it directly, not through the function), `schedule_pending_shift_report()` (daily 18:00 UTC `pg_cron`, inserts a `PENDING_GENERATION` placeholder row — nothing currently fills it in, so it does not complete report generation on its own), and `request_return_guest(access_token)` (guest analogue of `request_return`, added `20260629074319_guest_return_code.sql`).
- **Undocumented route added to `docs/API.md`**: `POST /api/public/weekend-request/[token]/return-code`, which calls `request_return_guest` — implemented but had no API.md entry.
- **No schema changes** — this entry covers documentation only.

### 2026-08-02 — Docs sync continued: BACKEND.md, TESTING.md, GITHUB.md, DATABASE.md RPC drift

- **Why**: companion pass to the docs-sync entry above, covering the docs that pass didn't touch, plus a few more drift points found in `docs/DATABASE.md` while cross-checking `supabase/migrations/` directly.
- `docs/DATABASE.md`: `requests_key_required_after_pending` constraint doc corrected — widened in `20260616120547_fix_guest_decline_constraint.sql` to allow `DECLINED` (not just `PENDING_HOD`); `expire_request`/`expire_guest_request`/`expire_lapsed_codes` docs corrected for the `20260627213243_weekend_code_expiry_rollback.sql` behaviour (a weekend code lapsing on its own requested date now rolls back to `APPROVED` instead of terminating to `EXPIRED`, audit `CODE_EXPIRED`); `authorisations.authorised_by` doc corrected — it's Dean-or-CSO depending on the key's `authoriser`, not unconditionally "HOD".
- `docs/API.md`: fixed field/response drift the earlier pass didn't cover — `verify-otp` requires `email` alongside `otp`; `register`/`activate-hod` have no `token` field (the invite-link session comes from `GET /api/auth/callback`, now documented) and only enforce an 8-char password minimum (flagged as weaker than the product spec's 12-char/mixed/symbol rule — a follow-up ticket, not a doc fix); `POST /api/requests/collect` ignores any client-supplied `verifier_id` and uses the session; `hod-decision`'s success response is `"APPROVED"`/`"DECLINED"`, never `"CODE_ISSUED"`; `cso-queue`/`cso-decision` corrected — there is no `PENDING_CSO` status, and `cso-decision` APPROVED is a no-op acknowledgement, not a state transition. Documented 12 previously-undocumented routes: `GET /api/admin/units` (+ its near-duplicate legacy alias `GET /api/admin/departments`), `POST /api/admin/keys`, `POST /api/admin/users/[id]/resend-invite`, `GET/POST/DELETE /api/profile/me|photo|signature`, `POST /api/shifts/start`, `POST/GET /api/auth/resend-otp|change-password|callback`. Added `mark_key_overdue`/`schedule_pending_shift_report` to the RPC cross-reference table (cron-only, no route caller).
- `docs/BACKEND.md`: tech-stack table corrected (Next.js "v14+" → 16, Tailwind "v3" → v4, matching `package.json`/`CLAUDE.md`). Added a note to §9 explaining the two background jobs no longer run through their Edge Functions over HTTP — see the 2026-06-22 "in-SQL jobs" entry below; the Edge Functions stay deployed but pg_cron calls the RPCs directly now.
- `docs/ARCHITECTURE.md`: tech-stack table corrected the same way; three lingering "(HOD)" parentheticals in the RLS/Realtime sections dropped now that the file's own auth section already establishes Dean is the current role name.
- `docs/TESTING.md`: removed the fictional pgTAP/`test:db` claim (no `supabase/tests/` directory or script exists — flagged as not-yet-implemented rather than deleted, since it's the stated intent) and the fictional `design:lint`/Lighthouse CI claims (neither exists anywhere in `.github/`); corrected the component-test co-location claim to match the actual `src/tests/<area>/*.test.tsx` convention; corrected the CI description — it's two separate workflows (`ci.yml`, `e2e.yml`), the latter PR-only and skipped for docs/supabase-only changes.
- `docs/GITHUB.md` §7: reconciled the work-order table against `docs/BACKEND.md` §14 and actual repo state — #20 (RiskTierBadge/RiskFactorPopover), #21 (Gemini reports), #22 (signature verification), #24 (edge functions), #25 (CI/CD) were all still marked ⬜/🔄 despite being done; corrected to ✅ with a note pointing future readers to §14 as the more current source.
- **No schema or app-code changes** — this entry covers documentation only.

### 2026-07-25 — Remove unused Supabase Claude plugin

- `.claude/settings.json`: removed `supabase` from `enabledPlugins` — unused, no functional effect on the app.

### 2026-07-23 — Design-system prompt docs synced to Dean/Unit rename; component test sweep

- **Why**: `design-system/prompts/` (the 34 Stitch prompt files + `screens.md`-adjacent specs) still said "HOD" and "Department" throughout, months after the app itself renamed to Dean/Unit — the same class of drift this changelog exists to catch, just in the design docs rather than the API docs. A new `design-system/prompts/_shared-blocks.md` canonical source was added specifically so the next rename doesn't require another file-by-file archaeology dig across 34 files.
- `c483abc` renames HOD → Dean and Department → Unit across every prompt file; `73eeac0` adds prompts for screens that didn't have one yet; `37e9a4b` adds the shared-blocks source file itself.
- `ad9a14d`: component test coverage extended to the remaining untested components in `src/components/smartkey/` (unit tests, not E2E).

### 2026-07-19 — Weekend request expiry guard on decisions; CSO chart time-range filters; middleware relocated

- `97d89a4`: `middleware.ts` moved from the repo root into `src/` — Next.js wasn't reliably picking it up from the root in this setup.
- `a39b40e`, `110d2bb`: a shared time-range filter component added for the CSO dashboard's events/incidents charts, then extended to the audit log and incidents tabs so all four surfaces filter consistently.
- `77a1e7a`: weekend requests whose requested date has already passed are now marked as such in the UI and Dean/CSO decision actions are blocked on them — the client-side companion to the `expire_stale_weekend_requests` DB job, closing the gap where a decision UI could still show a stale request as actionable for a moment after its date passed.

### 2026-07-05 — Weekend approval past-date guard; CSO create-key dialog

- `97a8d7f`: weekend approvals guarded against being approved for a date that has already passed; deactivated users hidden from key-assignment/collector pickers.
- `a1666f2`: CSO "create key" dialog added (backs `POST /api/admin/keys`, documented above); a bulk-acknowledge flag bug in the verifier handover flow fixed.

### 2026-07-03 — CSO dashboard charts; Dean recent-activity/collectors widgets; auth network-failure distinction

- **Why**: `design-system/screens.md` §4.3 and §4.4 specified a Dean "recent activity feed" + "authorised collectors table" and CSO chart surfaces that had never been built — this closes that gap, plus fixes a real bug where a Supabase connectivity outage was indistinguishable from a wrong password.
- `5629f00`, `19610d1`, `e92e3b4`: Recharts-based dashboard charts (donut + trend) added to the CSO dashboard for keys, incidents, and events; new `@google/generative-ai`-adjacent dependency `recharts` (`c1697a2`).
- `1aba088`: Dean dashboard gained a read-only recent-activity feed (sourced from `GET /api/keys/history`, faculty-scoped via RLS) and an authorised-collectors table (sourced from `authorisations`) — the two surfaces `screens.md` §4.3 calls for.
- `45ac3fe`: `POST /api/auth/login` now distinguishes a Supabase connectivity failure from invalid credentials via `isAuthRetryableFetchError`, returning `503` instead of conflating it into `401` — this is the behaviour `docs/API.md`'s login error table already documented; the code just hadn't shipped it yet at the time that doc line was written.

### 2026-07-01 — Signature verification wired into weekend requests; CSO signature-mismatch review; email provider reverted

- **Why**: signature verification (`src/lib/ai/signature/verifier.ts`) had existed since 2026-06-12 but nothing in the registered-requester weekend flow ever actually populated `submitted_signature_url`, so the pipeline had never run from real usage — only guest/CSO paths (which skip it) had been exercised.
- `4ba5f0e`: registered (non-guest) weekend requests can now optionally attach a Dean-signature image at submit (uploaded client-side to `weekend-letters`, passed through as `letter_url` on `POST /api/requests/submit`); the Dean approval sheet passes it through as `submitted_signature_url` to `hod-decision`, closing the loop. A `HELD_SIGNATURE_MISMATCH` response now renders an explicit held-confirmation card instead of being silently treated as an approval.
- `11fdc76` (PR #52): new CSO surface to review and `cso_override` a held signature mismatch — the UI for the `GET /api/ai/signature-alerts` + `cso_override` flow `docs/API.md` describes.
- `7d51fa4`, `927d96c`, `083530a`: email sending was briefly switched to Resend, then reverted back to Nodemailer/Gmail SMTP after a build-time crash from eager client initialisation. Net effect: no change from what `CLAUDE.md`/`docs/BACKEND.md` already documented.
- `fac3d56`: a repo-wide HOD→Dean sweep across `docs/API.md` and `design-system/screens.md` (superseded in scope by the two 2026-08-02 entries above, which found further drift these commits didn't catch — mostly in `docs/DATABASE.md` and the RPC-level detail in `docs/API.md`).

### 2026-06-29 — Guest return codes; verifier shift-start flow

- `57b4a81`, `15b0d8c`: new `request_return_guest(access_token)` RPC and a matching button on the guest weekend status page, so an external guest can generate a return code the same way a registered requester does via `POST /api/requests/request-return`. Documented above as `POST /api/public/weekend-request/[token]/return-code`.
- `e5c4b77`, `9af8516`: verifier dashboard gained an explicit "start shift" action (`POST /api/shifts/start`, documented above); a bug where the incidents route 500'd on shift lookup/insert fixed by switching to the admin client.
- `20d7cc5`: bulk shift-handover acknowledgement replaced with a select-all checkbox instead of a single implicit "acknowledge all" button.
- `9035d8c`: password-reset email now sent via the same branded Nodemailer template as other transactional email, instead of Supabase's default.

### 2026-06-27 — `departments` → `units` rename propagated through the API and UI layers; weekend code expiry rollback; signature/stamp replace flow; first test suite

- **Why**: the DB-level rename (`20260627111159_rename_departments_to_units.sql`, documented in the two 2026-08-02 entries above) needed the API and UI layers updated to match on the same day, plus a UX fix for a weekend-code dead end and the project's first real automated test coverage.
- `897899b`, `549b8d0`, `dbfb4d7`, `d4aa421`, `8204e6c`, `7cd1b67`: `unit_id`/`units` propagated through API routes (new `GET/POST /api/admin/units`), lib utilities, and UI labels/dropdowns.
- `398182c`: weekend collection-code expiry behaviour changed — a code that lapses on its own requested date now rolls back the request to `APPROVED` (so the requester can mint a fresh code the same day) instead of terminating to `EXPIRED`; only a code lapsing after its date has passed, or a weekday code, still terminates. See the `20260627213243_weekend_code_expiry_rollback.sql` note in the 2026-08-02 entry above.
- `20344b9`: Dean/CSO signature and stamp onboarding gained a "replace" flow, reusing the same Sharp+Pixelmatch pipeline as initial onboarding (`POST /api/profile/signature`, documented above).
- `e49d5e9`, `ec5231b`: first real Vitest + React Testing Library suite added (`src/tests/` tree) — the origin of the `src/tests/<area>/*.test.tsx` convention that `docs/TESTING.md` now documents in place of the co-located-test convention it used to claim.

### 2026-06-26 — Role rename: HOD → DEAN (structural)

- **Why**: the system was built with an `HOD` (Head of Department) role, but the real authoriser at the Senate Building is the **Dean** of each faculty — not a generic HOD. The rename brings the role name in line with the faculty model introduced 2026-06-25.
- **DB enum** (`20260626071734_rename_hod_to_dean.sql`): `ALTER TYPE public.user_role RENAME VALUE 'HOD' TO 'DEAN'`. This is oid-based, so check-constraints and plpgsql `CASE` nodes that reference the value survive automatically. The same migration recreates the 6 functions that embedded the literal `'HOD'` in function body text: `nominate_collector`, `remove_collector`, `approve_weekend`, `decline_weekend`, `approve_guest_weekend`, `provision_user` — all now use `'DEAN'`.
- **RLS text-policy fix** (`20260626071857_rename_hod_to_dean_rls_text_policies.sql`): 6 RLS policies used the `user_role()` SQL helper (returns text), so their `= 'HOD'::text` comparisons were NOT oid-based and would silently lock Deans out post-rename. Policies recreated with `'DEAN'::text`: `authorisations_delete_hod_dept`, `authorisations_insert_hod_dept`, `hod_decisions_select`, `profiles_select`, `requests_select`, `requests_select_hod_guest`. Policy names are kept as-is (historical identifiers).
- **Kept as-is (internal identifiers)**: the `hod_decisions` table, `hod_id` column, `HOD_APPROVED`/`HOD_DECLINED` audit event strings, `hod-decision` API endpoint, and the historical policy names remain unchanged — renaming internal identifiers at this stage would break in-flight data and add risk for no user-visible gain.
- **App code**: the `src/app/dean/` route tree, DEAN role checks in API routes, and the `dean` cookie namespace were already renamed externally before this session. `src/types/database.ts` regenerated (`user_role: "CSO" | "DEAN" | "VERIFIER" | "REQUESTER"`).
- **Verification**: `npm run typecheck` clean (stale `.next` generated files referencing removed `/hod` pages filtered out — regenerate on next build). `npm test` → 41 passing.

### 2026-06-25 — Keys remodelled around faculties + a CSO-authorised Administration group

- **Why**: the per-department model was too granular (12 departments, ~60 keys) and had no home for non-faculty Senate-Building offices (VC, DVCs, Registrar, Bursary, University Librarian) — rooms with no Dean/HOD who could sensibly authorise access. The real key-owning unit is the **faculty** (each owns a Dean's Office and a Porter's Lodge), and central offices belong to a single **Administration** group authorised by the **CSO** (who sits in the Senate Building and is the right authority for now).
- **Schema** (`20260625221600_faculties_and_admin_authoriser.sql`): new `public.department_authoriser` enum (`DEAN` | `CSO`) and `departments.authoriser` column (default `DEAN`), plus `keys.key_count` (number of physical keys on a bunch, default 1, shown to the verifier at issue/return). The `departments` table is reused as the grouping unit — each row is now a faculty or `Administration`; `keys.department_id` / `requests.requested_department_id` are unchanged, so no FK churn. **Data-destructive rebuild** (applied to the live project; the prior data was snapshotted to schema `_backup_20260625` first): the granular departments and their keys (and the requests/authorisations/hod_decisions tied to them) are removed and replaced with **4 faculties** (Engineering, Management Sciences, Science, Environmental Sciences — each Dean's Office + Porter's Lodge, Old Senate) and a single **Administration** group of 18 keys across both zones (New Senate: Bursary, VC [2-key bunch], DVC ×3, Registrar, Council, Academic Planning, Records, Legal, Academic Affairs, Internet Room, Communication, Procurement, Security; Old Senate: Confucius Institute, Bookshop, Library). `supabase/seed.sql` mirrors this for fresh resets. The redundant `faculty` column is kept equal to `name` for now (the CSO departments API still selects it) and is slated to be dropped once the UI stops reading it.
- **RPCs** (`20260625221659_authoriser_aware_rpcs.sql`): `nominate_collector`, `remove_collector`, `approve_weekend`, `decline_weekend`, and `approve_guest_weekend` now branch on the key's (or request's) department `authoriser`. For `authoriser = 'CSO'` the actor must be the CSO (no department match); otherwise the existing Dean (HOD role) + department-match check applies. `decline_weekend` gains an actor gate it previously lacked (the route was the only gate). CSO approvals skip signature verification (the CSO has no reference signature — mirrors the guest path).
- **API**: `POST /api/requests/hod-decision` now accepts the CSO for Administration requests (skipping the signature step). The `authorisations` POST/DELETE routes already delegate entirely to the RPC, so they became CSO-capable with no route change. RLS needed no changes — CSO already had read-all on `requests`/`hod_decisions`/`guest_requesters`, everyone reads `departments`/`keys`/`authorisations`, and the mutators are `SECURITY DEFINER`.
- **Other**: `weekend_without_memo` risk-factor copy generalised from "HOD memo approval" to "authoriser memo approval". `src/types/database.ts` updated for the new column/enum (regenerate with `npm run db:types` after applying migrations). Frontend changes (flattening the now-degenerate faculty→department dropdowns; a CSO surface to authorise/approve Administration keys) are a deferred Phase 2.

### 2026-06-23 — Risk engine: authorisation-aware outstanding-key rule

- **Why**: the `outstanding_key_not_returned` rule fired on every key a requester held, so a legitimate bulk collector (e.g. a porter collecting several authorised keys for HODs/deans) tripped MEDIUM/HIGH risk on every key after the first. That trains verifiers to ignore the badge ("just the porter again"), dulling the signal for genuinely suspicious requests. SmartKey deliberately allows multiple concurrent requests/issues across different keys (the only hard block is a duplicate active request for the _same_ key), so penalising bulk collection contradicted the design.
- The rule now suppresses when every key the requester is currently holding is one they are still authorised for; it fires only when they hold a key outside their current authorisations — the actually-suspicious case. New `RiskContext.outstandingKeysAuthorised` field (`src/lib/ai/risk/types.ts`, `rules.ts`); `POST /api/requests/submit` computes it from the requester's held keys (`CODE_ISSUED`/`KEY_ISSUED`) intersected with their `authorisations`. Same query now also derives `isWhitelisted`, so no extra round-trip.
- Tests: added the bulk-collector suppression case to `rules.test.ts`; updated `engine.test.ts` contexts. No DB migration — purely engine + route logic.

- **Why**: uploading a passport photo from account settings succeeded, but loading it back failed with `net::ERR_BLOCKED_BY_ORB`. The storage migration (`20260605000001`) declared `passport-photos` and `hod-signatures` as public so `getPublicUrl` works for account settings, verifier identity display, and HOD signature/stamp previews — but it used `INSERT ... ON CONFLICT DO NOTHING`, so on the live project (where the buckets pre-existed as private) the public flag was never applied. `getPublicUrl` on a private bucket returns a JSON error body, not image bytes; the browser blocks that cross-origin non-image response (ORB). The upload (POST) always worked; only the read-back failed.
- `supabase/migrations/20260623090000_make_photo_buckets_public.sql`: `UPDATE storage.buckets SET public = true` for `passport-photos` and `hod-signatures`, reconciling live to the declared intent. Applied to the live project. `weekend-letters` stays private by design (served via short-lived signed URLs).
- No code or data change needed: stored `photo_url` / `signature_ref_url` values were already in the `.../object/public/...` form `getPublicUrl` produces, so they resolve as soon as the bucket is public.

### 2026-06-22 — Shift report PDF download

- **Why**: the report Download button produced a `.md` file — a developer artifact, wrong for a CSO filing/printing/emailing an official operational record. `screens.md` §9.2 specifies PDF; markdown was the no-dependency placeholder. The on-screen report view stays as the quick preview; the PDF is an explicit, optional export (most CSOs only glance before logging out).
- Single **Download PDF** button (`src/app/cso/reports/[id]/_components/download-report.tsx`) replacing the markdown export. One format, no picker — matches the "one primary action" ethos and the audience (CSV stays on the audit log, where tabular data belongs).
- `report-pdf.tsx`: branded PDF via `@react-pdf/renderer` (maroon header, DESIGN.md token colours, Courier for timestamps), including the report body (small markdown parser for the generator's heading/list/bold/hr subset), the event timeline, comments, the "Generated by AI from shift event data" disclosure (with template-fallback note), and page numbers. The renderer module is dynamically imported on click so it stays out of the initial bundle and never runs server-side.
- New dependency: `@react-pdf/renderer`.

### 2026-06-22 — Auto-release unclaimed keys; scheduled jobs run in-SQL

- **Why (auto-release)**: a `CODE_ISSUED` request holds a 10-minute collection code, but expiry was only fired by the requester's open browser tab (`POST /api/requests/expire`). Closing the tab stranded the request in `CODE_ISSUED`, and `create_request`'s per-requester conflict check then blocked that requester from re-requesting the key — the key never freed up for them. (There is no global per-key lock; other authorised requesters were never blocked at the SQL level.)
- New RPC `expire_lapsed_codes()` (`supabase/migrations/20260622140310_expire_lapsed_codes.sql`): expires any `CODE_ISSUED` request (weekday/weekend, registered/guest) whose `code_expires_at < now()` → `EXPIRED`, clears the code, writes a guest-aware `REQUEST_EXPIRED` audit entry. Cron-only; scheduled every 10 minutes. The UI-fired expiry remains the immediate path for the active user; this is the backstop for everyone else.
- **Why (in-SQL jobs)**: the `overdue-key-check` and `daily-shift-summary` cron jobs were scheduled to `http_post` to edge functions via `current_setting('app.supabase_url')` / `('app.edge_function_key')`, but `ALTER DATABASE ... SET` of custom parameters is not permitted on managed Supabase, so those settings were null and the jobs silently never fired since launch.
- `supabase/migrations/20260622140052_cron_jobs_direct_sql.sql`: both jobs now run their SQL directly in pg_cron (no HTTP, no secret). `overdue-key-check` → `mark_key_overdue()`; `daily-shift-summary` → new RPC `schedule_pending_shift_report()` (SQL equivalent of the edge function — inserts the `PENDING_GENERATION` placeholder for the latest unreported shift). The edge functions stay deployed but are no longer the cron entry point.
- Note: the weekend-reminder flow already matches the intended UX — no code is emailed; the reminder links to the page (`/requester/dashboard` or `/weekend-access/[token]`) where a button mints the 10-minute code on the day.

### 2026-06-22 — Morning reminder for approved weekend requests

- **Why**: no collection code is ever emailed for the weekend flow — the requester (or guest) mints a short-lived code on the requested day from their dashboard / status page. Without a nudge, an approved request is easy to forget until the day passes (after which it can no longer be actioned — see the dead-end fix above). Closes the "I didn't get anything" experience gap.
- New email sender `sendWeekendReminderEmail` in `src/lib/email/otp.ts` (nodemailer, same template language), linking registered requesters to `/requester/dashboard` and guests to `/weekend-access/[token]`.
- New `reminder_sent_at` column on `requests` (`supabase/migrations/20260622134716_weekend_code_reminders.sql`) for send idempotency.
- New route `POST /api/cron/weekend-reminders` — bearer-guarded by `CRON_SECRET`, service-role. Finds `APPROVED` weekend requests due today (registered + guest) not yet reminded, emails each, stamps `reminder_sent_at`. Returns `{ sent, failed }`.
- `pg_cron` job `weekend-code-reminders` at 06:00 UTC on Sat/Sun, POSTing to the route with a bearer secret read from Supabase Vault (`weekend_cron_secret`). The secret must match the app's `CRON_SECRET` env var; `ALTER DATABASE ... SET` is not permitted for custom parameters on managed Supabase, so Vault is used (the pre-existing edge-function schedules in `20260612000002` rely on that unsupported mechanism and have therefore never fired). See the migration header and `.env.local.example`.

### 2026-06-22 — Expire stale weekend requests (dead-end fix)

- **Why**: a weekend request had no lifecycle terminus once its requested date passed. The happy path requires the requester (or guest) to mint a short-lived collection code ON the requested day via `generate_weekend_code` / `generate_guest_weekend_code`. If the day passed without a code being minted, the request was stranded in `APPROVED` (or `PENDING_HOD`): `generate_weekend_code` raises `TOO_EARLY` forever (`requested_for <> current_date`), the cancel route only accepted `CODE_ISSUED`, and `create_request` counts any non-terminal status as an active request — so the request and its key stayed blocked with no user-facing escape. (Observed in production: two `APPROVED` requests for 2026-06-20 permanently blocking keys OE-203 and OE-204.)
- New RPC `expire_stale_weekend_requests()` (`supabase/migrations/20260622134126_expire_stale_weekend_requests.sql`): expires `WEEKEND` requests where `requested_for < current_date` and status is `PENDING_HOD` / `APPROVED` / `CODE_ISSUED`, clearing the code and writing a `REQUEST_EXPIRED` audit entry per row (guest-aware via `_write_audit_guest`). Idempotent; cron-only (execute revoked from `public`/`anon`/`authenticated`). Scheduled daily at 00:15 UTC via `pg_cron` calling the function directly (no edge function needed).
- `POST /api/requests/cancel`: now also cancellable from `PENDING_HOD` and `APPROVED`, not just `CODE_ISSUED`, giving the requester a manual escape hatch for a weekend request before its code is minted.
- Note: no code is ever emailed for the weekend flow — by design the code is minted on the requested day from the dashboard. This is unchanged; the fix only addresses the stranded-state dead-end.

### 2026-06-22 — CI/CD pipeline and testing configuration (issue #25)

- **Why**: no automated checks were running on PRs — typecheck, lint, unit tests, and build all required manual runs locally. E2E tests had packages installed but no Playwright config or test files.
- `.github/workflows/ci.yml`: runs typecheck → lint → unit tests → build on every push/PR to `main`.
- `.github/workflows/e2e.yml`: installs Playwright browsers, builds the app, runs E2E suite on every PR; uploads the Playwright report as an artifact on failure.
- `playwright.config.ts`: Desktop Chrome + Pixel 5 projects, `retries: 2` in CI, `webServer` pointing at `npm run start`, `BASE_URL` from env.
- `vitest.config.ts`: added `@vitejs/plugin-react` plugin, `environment: 'jsdom'`, `setupFiles`, and excludes `tests/e2e/**` so Playwright specs never run under Vitest.
- `tests/setup.ts`: global Vitest setup file (placeholder for future RTL imports).
- `tests/e2e/public/auth.spec.ts`, `tests/e2e/cso/dashboard.spec.ts`, `tests/e2e/hod/dashboard.spec.ts`, `tests/e2e/verifier/dashboard.spec.ts`, `tests/e2e/requester/dashboard.spec.ts`: placeholder E2E specs covering happy path, one error path, axe-core scan, and unauthenticated redirect per role.

### 2026-06-16 — Gemini shift report generation (issue #21)

- **Why**: shift-report generation was half-built — a working Gemini-with-fallback implementation lived inline in `POST /api/reports/generate`, but it wasn't factored into the named library, used a raw `fetch` instead of the SDK, never wrote the summary counts the list card reads (always showed 0), and there was no detail page to actually read a report (the generate dialog linked to a 404).
- New `src/lib/ai/reports/`: `types.ts`, `prompts.ts` (`buildReportPrompt` + `buildTemplateReport`), `parser.ts` (`parseGeminiOutput` + `computeMetadataCounts`), `client.ts` (`generateShiftReport` via the `@google/generative-ai` SDK with deterministic template fallback). Model defaults to `gemini-3.5-flash` (the prior `gemini-2.0-flash` was discontinued 2026-06-01), overridable via `GEMINI_MODEL`.
- `POST /api/reports/generate` refactored to call the library and persist `{ markdown, timeline, metadata }` (counts + source) via the admin client.
- New `/cso/reports/[id]` detail page (RSC): markdown body via `react-markdown` + `remark-gfm` (token-styled, no raw HTML), `<ShiftTimeline>` (`src/components/smartkey/shift-timeline.tsx`), immutable comments list + comment form, the AI disclosure, and a Markdown download. The reports list card title now links here.
- 12 new Vitest unit tests (`parser.test.ts`, `prompts.test.ts`). Added `react-markdown` + `remark-gfm` deps and `GEMINI_MODEL` to `.env.local.example`.

### 2026-06-16 — Guest audit actor_name stored without "(external)" suffix

- **Why**: `_write_audit_guest` callers stored `actor_name` as `'<name> (external)'`. The suffix was display cruft — a guest event is already identified by `actor_id IS NULL` and `payload->>'external' = true`, so the name itself should be the plain guest name. The CSO audit table had a UI band-aid stripping the suffix; this fixes it at the source.
- `supabase/migrations/20260616130000_guest_audit_drop_external_suffix.sql` (applied to remote): recreates `create_guest_weekend_request`, `generate_guest_weekend_code`, and `expire_guest_request` to pass the bare guest name to `_write_audit_guest`; the `external: true` payload boolean (the real discriminator) is unchanged. No code reads the name suffix for logic. Verified via a rolled-back smoke test: `actor_name` plain, `actor_id`/`actor_role` null, `payload.external = true`.
- The CSO audit table keeps its `(external)`-stripping fallback as a harmless guard for any rows written by older function versions in other environments.

### 2026-06-16 — guest_requesters RLS: HOD and VERIFIER read access

- **Why**: `guest_requesters` only had a CSO-all SELECT policy. PostgREST silently nulled the `guest_requesters` join in the HOD pending-requests query, causing "Unknown requester" on the HOD dashboard. The verifier collect route had the same gap for guest key issuance.
- `supabase/migrations/20260616115021_guest_requesters_rls_hod_verifier.sql`: adds two SELECT policies. HOD reads guests whose request is scoped to their department (via `requested_department_id` while pending, or `key_id → keys.department_id` after assignment). VERIFIER reads guests where a `CODE_ISSUED` / `KEY_ISSUED` request exists.
- No code changes; the existing queries now return real data instead of null.

### 2026-06-16 — Guest weekend request: requested room field

- **Why**: a guest picks a department only (the HOD assigns the actual key on approval), but the HOD had no indication of which room/area the guest actually needs. This adds a free-text `requested_room` the guest states at submit and the HOD sees before assigning a key.
- `supabase/migrations/20260615000003_add_requested_room_to_guest_requests.sql` (applied to remote): adds `requests.requested_room text` and recreates `create_guest_weekend_request` with a 10th param `p_requested_room` (drops the old 9-arg signature to avoid an overload conflict; execute revoked from `public`/`anon`/`authenticated`). The value is stored on the request and included in the `REQUEST_CREATED` audit payload.
- `POST /api/public/weekend-request` validates `requested_room` (zod, max 200) and passes it to the RPC; `GET /api/public/weekend-request/[token]` returns it; the public form, status page, and `src/types/database.ts` all carry the field.

### 2026-06-15 — External (non-registered) weekend key requests

- **Why**: the security desk's real-world rule is that anyone may collect a key on the weekend provided they have HOD authorisation, but SmartKey only supported weekend requests from registered users (those with a `profiles` + `auth.users` account). This adds a guest path so an external person, with no account, can submit a weekend request that an HOD authorises, ultimately producing a 6-digit collection code for the desk. Registered-user flows are unchanged.
- Guests are modelled as their own entity (`guest_requesters`), never an auth user/profile — `profiles.id references auth.users(id)`, so a guest profile would require an auth user and break the `invited_by` chain-of-trust. Guests are session-less: all guest mutations go through `SECURITY DEFINER` RPCs called from server-side routes via the service-role admin client (`anon`/`public` execute revoked); the guest reaches their status/code page via an unguessable `requests.access_token`.
- `supabase/migrations/20260615000001_guest_weekend_requests_schema.sql` (applied to remote) — new `guest_requesters` table (CSO-only select); `requests.requester_id` and `key_id` made nullable; new `requests` columns `guest_id`, `requested_department_id`, `access_token`, `letter_url`; CHECK `requests_one_requester_kind` (exactly one of requester_id/guest_id) and `requests_key_required_after_pending` (key_id null only while PENDING_HOD); new `requests_select_hod_guest` RLS policy so HOD sees unassigned guest requests for their department; `audit_log.actor_id`/`actor_role` made nullable for guest-initiated events.
- `supabase/migrations/20260615000002_guest_weekend_requests_rpcs.sql` (applied to remote) — `_write_audit_guest` helper (null actor, `'<name> (external)'` actor_name); `create_guest_weekend_request` (guest + PENDING_HOD request + access_token, audit `REQUEST_CREATED`); `approve_guest_weekend(request_id, hod_id, key_id, note?)` (HOD assigns the key at approval → APPROVED, audit `HOD_APPROVED`; no signature verification — HOD reviews the uploaded letter); `generate_guest_weekend_code(access_token)` (mints a 10-min code on the requested date, raises TOO_EARLY before); `expire_guest_request(access_token)` (idempotent auto-expire). `issue_key` is reused unchanged for desk collection.
- Public routes (no auth; admin client): `POST /api/public/weekend-request` (multipart; uploads the HOD letter to `weekend-letters`, emails the status link), `GET /api/public/weekend-request/[token]`, `POST /api/public/weekend-request/[token]/code`, `POST /api/public/weekend-request/[token]/expire`. `/weekend-access` and `/api/public/*` added to the unauthenticated middleware allowlist.
- Existing routes: `POST /api/requests/hod-decision` accepts an optional `key_id` and calls `approve_guest_weekend` for guest requests (signature verification skipped for guests); `POST /api/requests/collect` returns the guest name + declared ID document instead of a passport photo.
- UI: public guest request form (`/weekend-access`) and session-less status/code page (`/weekend-access/:token`, mirroring the registered code-display countdown/copy/auto-expire); HOD pending panel/decision sheet flag guest requests "External", surface the guest's details, and require a key pick before approval; verifier collect view renders guest name + declared ID. New HOD-gated `GET /api/requests/[id]/letter` returns a 5-minute signed URL so the HOD can preview the uploaded authorisation letter; `GET /api/requests/pending` now includes the joined guest fields.

### 2026-06-14 — Weekend collection code deferred to the day + auto-expire

- **Why**: `approve_weekend` issued the collection code at HOD approval with `code_expires_at = requested_for + 1 day`, so an approved weekend request had a working code valid for the whole week until the date — defeating the point of a short-lived OTP. Separately, an expired weekday code lingered in `CODE_ISSUED` and forced the requester to manually cancel a dead code.
- `supabase/migrations/20260614000003_request_status_add_approved.sql` + `20260614000004_weekend_deferred_code_and_expiry.sql` (applied to remote): new `APPROVED` request status; `create_request` (WEEKEND) no longer mints a code; `approve_weekend` moves to `APPROVED` with no code; new `generate_weekend_code(request_id, requester_id)` mints a 10-min code on the requested date only; new `expire_request(request_id, requester_id)` flips a genuinely-expired `CODE_ISSUED` → `EXPIRED` (audit `REQUEST_EXPIRED`).
- Routes: `POST /api/requests/weekend-code`, `POST /api/requests/expire`. `hod-decision` now reports `APPROVED` on approval.
- UI: new `WeekendRequestsPanel` on the requester dashboard shows weekend request status (Awaiting HOD / Approved / Declined) with a "Get collection code" action on the day. The active-request banner and the code page auto-fire `/api/requests/expire` when the countdown hits 0, replacing the manual cancel for expired codes.
- `src/types/database.ts`: `APPROVED` added to `request_status`; `generate_weekend_code` + `expire_request` signatures; `approve_weekend` code now nullable.

### 2026-06-14 — Audit auth events (login + password change)

- **Why**: the audit log had no record of authentication, so an incident timeline couldn't show when someone actually accessed the system. Added `LOGIN_SUCCEEDED` and `PASSWORD_CHANGED`.
- `LOGIN_SUCCEEDED` is written at the _completed_ login, not the password step (an OTP prompt isn't a login — the user may abandon it). For CSO/HOD/VERIFIER that's after OTP in `src/app/api/auth/verify-otp/route.ts`; for REQUESTER (no MFA) it's the successful return in `src/app/api/auth/login/route.ts`. Payload records the `method` (`OTP` / `PASSWORD`).
- `PASSWORD_CHANGED` is written after a successful update in `src/app/api/auth/change-password/route.ts`.
- All three are best-effort (wrapped in try/catch + logged): a session/password change has already happened, so an audit failure must not fail the user's request.
- `src/app/cso/audit/_components/audit-table.tsx` — maps the new events (`LOGIN` and `SETTINGS` UI types) so they display and filter; the previously dead "Login" filter chip now returns rows.
- Suggested next (not yet added): `LOGOUT` (needs the logout route to resolve the role cookie namespace to attribute the actor), `LOGIN_FAILED` (failed OTP/password — security-relevant), `PASSWORD_RESET_COMPLETED`.

### 2026-06-14 — Fix Realtime in production (explicit websocket auth)

- **Why**: live updates worked locally but not in the deployed app (same Supabase backend), so the verifier queue / issue / return flows needed a manual refresh. Root cause was client-side: nothing called `realtime.setAuth()`, so the websocket relied on `@supabase/ssr` propagating the JWT implicitly. The session is read from cookies asynchronously, so a channel could join before it resolved and authenticate as `anon` — RLS then silently withheld every `postgres_changes` event while the channel still reported `SUBSCRIBED`. Dev StrictMode's double-mount re-subscribed after the token was ready and masked the race; production's single mount lost it.
- `src/lib/supabase/client.ts` — the singleton browser client now sets the Realtime token from the persisted session immediately and refreshes it on every `onAuthStateChange`. `setAuth` also pushes the token to already-joined channels, so it heals a channel that joined as `anon`. No DB change was needed (publication + replica identity were already correct and shared with localhost). Requires a redeploy to take effect.

### 2026-06-14 — Denormalise actor name + department onto audit_log

- **Why**: the CSO audit page is read-heavy (server-side pagination, counts, filters on every page change) and showed only a truncated `actor_id`, which carries no investigative value. Joining `profiles`/`departments` on every read would put the cost on the hot path. The table already denormalises `actor_role` for the same reason — this extends that pattern. Capturing the values at write time is also semantically correct for an immutable journal: each entry records who the actor was at the moment of the event, so a later rename or department move cannot rewrite history.
- `supabase/migrations/20260614000002_audit_log_actor_denormalisation.sql` (applied to remote) — adds `audit_log.actor_name` + `actor_department`; populates them inside the `_write_audit` RPC helper via one by-PK lookup per write; backfills the 152 existing rows.
- `src/lib/audit/index.ts` — the TS `writeAuditEntry` (used by the 4 routes that bypass the RPC helper) now looks up and denormalises the same two columns so both write paths stay consistent.
- `src/app/cso/audit/_components/audit-table.tsx` — reads the new columns (name falls back to payload then truncated id), adds a Department column. `src/types/database.ts` — `audit_log` Row/Insert/Update gain the two nullable columns.

### 2026-06-14 — Requester-verified key return (return OTP)

- **Why**: a key could be marked returned by the verifier alone, with no proof the requester actually handed it back — a malicious or careless officer could log phantom returns. This puts the requester back in the loop, mirroring the collection-code flow.
- `supabase/migrations/20260614000001_return_code_flow.sql` (applied to remote) — adds `requests.return_code` + `return_code_expires_at`; new `request_return(request_id, requester_id)` RPC (generates a 6-digit return code, 15-min expiry, `RETURN_CODE_GENERATED` audit); replaces `return_key` with `return_key(request_id, verifier_id, code?, returner_id?, override_reason?)`.
- `return_key` now requires either the requester's `code` (verified → `KEY_RETURNED`) or an `override_reason` (unverified → `KEY_RETURNED_UNVERIFIED` audit event + a `SUSPICIOUS_ACTIVITY` incident raised to the CSO when an open shift exists). Incident creation never blocks the return.
- `src/app/api/requests/request-return/route.ts` — new REQUESTER route. `src/app/api/keys/return/route.ts` — accepts `code`/`override_reason`, uses the server-verified `user.id` as the verifier (no client-supplied id).
- `src/app/requester/_components/active-request-banner.tsx` — "Return key" action on the issued-key banner; shows the return code with a countdown.
- `src/app/verifier/_components/outstanding-keys.tsx` — return sheet now has a 6-digit code-entry step (reuses `InputOTP`) plus a flagged "return without code" override path.
- `src/hooks/useRealtime.ts` — fixed a generic-variance type error in the registry→callback bridge (cast the base registry payload to the hook's `RealtimePayload<T>`).
- Docs: `docs/API.md`, `docs/DATABASE.md` updated.

### 2026-06-12 — Supabase Edge Functions: overdue key check + daily shift summary (PR #24, branch: backend/feat/24-edge-functions)

- `supabase/functions/overdue-key-check/index.ts` — Deno Edge Function. Calls `mark_key_overdue()` RPC with service-role client. Logs structured JSON (`overdue_check_complete`, `updated_count`). Deployed to Supabase Cloud.
- `supabase/functions/daily-shift-summary/index.ts` — Deno Edge Function. Finds the most recent shift without a report, inserts a `PENDING_GENERATION` placeholder into `shift_reports`, writes a `SHIFT_REPORT_SCHEDULED` audit entry attributed to the first active CSO. Actual Gemini generation is triggered by the CSO from their dashboard. Logs structured JSON. Deployed to Supabase Cloud.
- `supabase/config.toml` — added `[functions.overdue-key-check]` and `[functions.daily-shift-summary]` blocks; both have `verify_jwt = false` (called by pg_cron, not by a user session).
- `supabase/migrations/20260612000002_edge_function_schedules.sql` — enables `pg_cron` and `pg_net`; registers hourly cron for overdue-key-check (`0 * * * *`) and daily cron for daily-shift-summary (`0 18 * * *`). Applied and active on Supabase Cloud.

### 2026-06-12 — Signature verification: Sharp + Pixelmatch pipeline (PR #22, branch: backend/feat/22-signature-verification)

- `src/lib/ai/signature/verifier.ts` — greyscale → resize to 800×400 → binary threshold → RGBA expand → Pixelmatch diff. Returns `{ mismatch_ratio, passed }`. Threshold from `SIGNATURE_DIFF_THRESHOLD` env var (default 0.15).
- `src/lib/ai/signature/verifier.test.ts` — 4 unit tests: identical images (ratio=0), ~10% mismatch (passes), ~50% mismatch (fails), custom threshold.
- `src/app/api/ai/verify-signature/route.ts` — internal POST endpoint. Fetches HOD reference and submitted image by URL, runs pipeline, returns result. Gated by `x-internal-secret: <SUPABASE_SERVICE_ROLE_KEY>` header.
- `src/app/api/requests/hod-decision/route.ts` — APPROVED path now: (1) blocks if HOD has no `signature_ref_url` (onboarding incomplete); (2) when `submitted_signature_url` is present, runs pixel comparison — if mismatch exceeds threshold, approval is held and a `SIGNATURE_MISMATCH` audit entry is written (ref URL, submitted URL, mismatch %) for CSO review; if passes, calls `approve_weekend` RPC with real mismatch data.
- `supabase/migrations/20260612000001_weekend_letters_bucket.sql` + applied to remote — adds the `weekend-letters` private storage bucket with RLS: requesters upload their own letters; HOD and CSO can read.

### 2026-06-09 — Supabase Realtime subscriptions and offline guard (PR #39, branch: backend/feat/18-realtime-offline)

- `src/hooks/useRealtime.ts` — generic subscription hook. Accepts `table`, optional `filter`, and `onInsert`/`onUpdate`/`onDelete` callbacks. Reconnects automatically with exponential backoff (1 s → 2 s → 4 s → ... → 30 s cap). After 30 s without a successful connection, emits `'offline'` status.
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
