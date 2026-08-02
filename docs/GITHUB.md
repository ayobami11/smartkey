# SmartKey — GitHub Workflow Guide

How to organise backend work on GitHub: labels, milestones, issues, sub-issues, branch names, and PR templates. Run the `gh` commands below in your own terminal (requires `gh auth login`).

---

## 1. Labels

Run once to create all labels:

```bash
# Backend domain
gh label create "backend"  --color "#0075ca" --description "All server-side work"
gh label create "database" --color "#e4e669" --description "Schema, migrations, RLS, RPCs"
gh label create "api"      --color "#d93f0b" --description "Route handlers"
gh label create "ai"       --color "#0e8a16" --description "Risk engine, Gemini, signature"
gh label create "auth"     --color "#5319e7" --description "Auth flow, session, MFA"
gh label create "realtime" --color "#1d76db" --description "Supabase Realtime subscriptions"
gh label create "ci/cd"    --color "#b60205" --description "GitHub Actions, Edge Functions"
gh label create "testing"  --color "#006b75" --description "Vitest, Playwright, axe-core"
gh label create "docs"     --color "#cfd3d7" --description "Keeping documentation current"
```

---

## 2. Milestones

```bash
gh api repos/{owner}/{repo}/milestones \
  -f title="Milestone 1 — Foundation: Supabase + Auth" \
  -f description="Working login, RLS, role-gated middleware, shared client utilities" \
  -f due_on="2026-06-15T00:00:00Z"

gh api repos/{owner}/{repo}/milestones \
  -f title="Milestone 2 — Request Workflow" \
  -f description="Full request lifecycle, verifier queue, Realtime subscriptions, offline guard" \
  -f due_on="2026-07-06T00:00:00Z"

gh api repos/{owner}/{repo}/milestones \
  -f title="Milestone 3 — AI Risk Engine" \
  -f description="Rule-based risk scoring, RiskTierBadge, verifier high-risk gate" \
  -f due_on="2026-07-20T00:00:00Z"

gh api repos/{owner}/{repo}/milestones \
  -f title="Milestone 4 — LLM + Signature" \
  -f description="Gemini shift reports, pixel-level signature verification, Supabase Storage" \
  -f due_on="2026-08-03T00:00:00Z"

gh api repos/{owner}/{repo}/milestones \
  -f title="Milestone 5 — CSO Backend + Jobs" \
  -f description="Building Pulse, shift handover, edge functions, CI/CD pipeline" \
  -f due_on="2026-08-24T00:00:00Z"
```

Replace `{owner}/{repo}` with `ayobami11/smartkey` (or whatever the repo is).

---

## 3. Issues

### How sub-issues work in SmartKey

GitHub now supports native **sub-issues** (in beta). To link a child issue to a parent:

1. Open the parent issue.
2. In the right sidebar, click **Sub-issues → Add sub-issue**.
3. Paste the child issue URL or number.

Alternatively, **reference the parent** in every child issue body with `Part of #N`. This creates a tracked cross-reference and appears in the parent's timeline.

The issue bodies below use **checkbox task lists** inside one issue as the primary approach — one issue per logical deliverable, with sub-tasks as checkboxes. This keeps the issue count manageable (17 issues, not 80+).

---

### Milestone 1 — Foundation

#### Issue 7 — Supabase project setup and package installation

```bash
gh issue create \
  --title "feat: Supabase project setup and package installation" \
  --label "backend,database" \
  --milestone "Milestone 1 — Foundation: Supabase + Auth" \
  --body "## Summary
Install all missing production and dev packages, initialise the Supabase project locally, and establish the environment variable structure.

## Branch
\`backend/setup/7-supabase-init\`

## Checklist
- [ ] Install prod deps: \`@supabase/supabase-js\`, \`@supabase/ssr\`, \`resend\`, \`@google/generative-ai\`, \`sharp\`, \`pixelmatch\`
- [ ] Install dev deps: \`vitest\`, \`@vitejs/plugin-react\`, \`@playwright/test\`, \`@axe-core/playwright\`, \`@types/sharp\`, \`@types/pixelmatch\`
- [ ] Add scripts to \`package.json\`: \`typecheck\`, \`test\`, \`test:watch\`, \`test:e2e\`, \`db:migrate\`, \`db:types\`
- [ ] Run \`supabase init\` → creates \`supabase/config.toml\`
- [ ] Create \`.env.local.example\` with all required variables
- [ ] Update \`docs/BACKEND.md\` §14 status table
- [ ] Update \`docs/CHANGELOG.md\`

## Verification
\`npm run typecheck\` passes (or no TS errors on a clean install)."
```

---

#### Issue 8 — Database schema migrations

```bash
gh issue create \
  --title "feat: database schema migrations (all 11 tables)" \
  --label "backend,database" \
  --milestone "Milestone 1 — Foundation: Supabase + Auth" \
  --body "## Summary
Write timestamped Supabase migration files for every table. All business-critical rules enforced at the DB level.

## Branch
\`backend/feat/8-schema-migrations\`

## Checklist
- [ ] Migration: \`profiles\`, \`departments\` (with \`hod_id\` FK)
- [ ] Migration: \`keys\` (zone enum, status enum), \`authorisations\` (UNIQUE(key_id, slot_number), CHECK slot IN 1-3)
- [ ] Migration: \`requests\` (full status enum, risk_tier, code, code_expires_at), \`hod_decisions\`
- [ ] Migration: \`shifts\`, \`shift_handovers\`
- [ ] Migration: \`shift_reports\` (immutable after insert), \`shift_report_comments\` (immutable)
- [ ] Migration: \`incidents\` (INSERT-only role permission on app role)
- [ ] Migration: \`audit_log\` (deny UPDATE/DELETE for all roles including service)
- [ ] \`supabase/seed.sql\`: 2 departments, 1 CSO profile, 5 sample keys per zone
- [ ] Run \`npm run db:types\` → generates \`src/types/database.ts\`
- [ ] Update \`docs/BACKEND.md\` §14 + \`docs/CHANGELOG.md\`

## Verification
\`supabase start && supabase db reset\` — seed loads without error; \`src/types/database.ts\` is generated."
```

---

#### Issue 9 — RLS policies

```bash
gh issue create \
  --title "feat: row level security policies (all tables)" \
  --label "backend,database" \
  --milestone "Milestone 1 — Foundation: Supabase + Auth" \
  --body "## Summary
Define RLS policies for every table. Policies are the authoritative data-isolation layer; route-level role checks are defence-in-depth only.

## Branch
\`backend/feat/9-rls-policies\`

## Checklist
- [ ] \`profiles\`: own row (all); same-department reads (HOD); all reads (CSO)
- [ ] \`keys\`: all read; CSO INSERT/UPDATE; no DELETE
- [ ] \`authorisations\`: HOD INSERT for own dept; all read; HOD DELETE own dept
- [ ] \`requests\`: REQUESTER own; HOD own dept; VERIFIER on-shift all; CSO all
- [ ] \`hod_decisions\`: HOD INSERT own dept; CSO read all
- [ ] \`shifts\`, \`shift_handovers\`: VERIFIER INSERT; CSO read all
- [ ] \`shift_reports\`, \`shift_report_comments\`: INSERT via RPC only; CSO read; no UPDATE/DELETE
- [ ] \`incidents\`: all INSERT; CSO read; no UPDATE/DELETE
- [ ] \`audit_log\`: INSERT via RPC only; CSO read; deny UPDATE/DELETE for service role
- [ ] Write pgTAP tests in \`supabase/tests/\` for each policy
- [ ] Update \`docs/BACKEND.md\` §14 + \`docs/CHANGELOG.md\`

## Verification
pgTAP test suite passes: \`supabase test db\`"
```

---

#### Issue 10 — Postgres RPCs

```bash
gh issue create \
  --title "feat: postgres RPCs (10 functions)" \
  --label "backend,database" \
  --milestone "Milestone 1 — Foundation: Supabase + Auth" \
  --body "## Summary
All multi-table mutations go through RPCs so that state changes and audit log writes are atomic.

## Branch
\`backend/feat/10-rpcs\`

## Checklist
- [ ] \`provision_user(name, email, role, department_id?)\` — profile + activation token + email queue + audit entry
- [ ] \`create_request(key_id, return_time, type, weekend_date?)\` — authorisation check + code gen + audit entry
- [ ] \`issue_key(request_id, verifier_id)\` — status KEY_ISSUED + clear code + audit entry
- [ ] \`return_key(request_id, verifier_id, returner_id?)\` — status KEY_RETURNED + audit entry
- [ ] \`approve_weekend(request_id, hod_id, note?)\` — hod_decisions row + code gen + audit entry
- [ ] \`decline_weekend(request_id, hod_id, note?)\` — hod_decisions row + audit entry
- [ ] \`acknowledge_shift_handover(outgoing_shift_id, key_ids, bulk)\` — handover row + per-key audit entries
- [ ] \`generate_shift_report(shift_id)\` — immutable shift_reports row + audit entry
- [ ] \`add_report_comment(report_id, text)\` — immutable comment + audit entry
- [ ] \`mark_key_overdue()\` — batch UPDATE outstanding keys past deadline + audit entries
- [ ] pgTAP tests for each RPC (happy path + rollback on error)
- [ ] Update \`docs/BACKEND.md\` §14 + \`docs/CHANGELOG.md\`

## Verification
pgTAP passes; run \`issue_key\` directly and confirm audit_log row was inserted."
```

---

#### Issue 11 — Supabase client utilities, logger, audit writer, shared types

```bash
gh issue create \
  --title "feat: supabase client utilities, logger, audit writer, and shared types" \
  --label "backend,api" \
  --milestone "Milestone 1 — Foundation: Supabase + Auth" \
  --body "## Summary
Typed Supabase clients, structured logger, write-only audit helper, and shared TypeScript types that every route imports.

## Branch
\`backend/feat/11-supabase-client\`

## Files
- \`src/lib/supabase/server.ts\` — \`createServerClient()\` (cookie-based; API routes + Server Components)
- \`src/lib/supabase/client.ts\` — \`createBrowserClient()\` (singleton; Client Components + hooks)
- \`src/lib/supabase/middleware.ts\` — \`updateSession()\` helper for \`middleware.ts\`
- \`src/lib/logger.ts\` — structured JSON logger (wraps console internally; exported as \`logger\`)
- \`src/lib/audit/index.ts\` — \`writeAuditEntry(event, actorId, targetType, targetId, payload)\` (calls RPC; write-only)
- \`src/types/api.ts\` — \`ApiResponse<T>\` envelope type
- \`src/types/database.ts\` — auto-generated (run \`npm run db:types\`)

## Checklist
- [ ] \`src/lib/supabase/server.ts\`
- [ ] \`src/lib/supabase/client.ts\`
- [ ] \`src/lib/supabase/middleware.ts\`
- [ ] \`src/lib/logger.ts\`
- [ ] \`src/lib/audit/index.ts\`
- [ ] \`src/types/api.ts\`
- [ ] \`src/types/database.ts\` (generated)
- [ ] Update \`docs/BACKEND.md\` §14 + \`docs/CHANGELOG.md\`

## Verification
\`npm run typecheck\` passes with no errors. Import \`createServerClient\` in a dummy file and confirm it resolves."
```

---

#### Issue 12 — Auth middleware and role gating

```bash
gh issue create \
  --title "feat: Next.js middleware — session validation and role gating" \
  --label "backend,auth" \
  --milestone "Milestone 1 — Foundation: Supabase + Auth" \
  --body "## Summary
Root \`middleware.ts\` validates the Supabase session on every request and redirects users who are unauthenticated or in the wrong role.

## Branch
\`backend/feat/12-middleware\`

## Route gates
| Route prefix | Allowed role | Redirect if denied |
|---|---|---|
| \`/cso/*\` | CSO | \`/login\` |
| \`/hod/*\` | HOD | \`/login\` |
| \`/verifier/*\` | VERIFIER | \`/login\` |
| \`/me/*\` | REQUESTER | \`/login\` |
| \`/login\`, \`/activate/*\` | Unauthenticated only | Role dashboard |

## Checklist
- [ ] \`middleware.ts\` at project root
- [ ] Uses \`getUser()\` not \`getSession()\` for auth decisions
- [ ] Role read from \`profiles.role\` (not JWT claim)
- [ ] Matcher config excludes static files and \`_next\`
- [ ] Update \`docs/BACKEND.md\` §14 + \`docs/CHANGELOG.md\`

## Verification
Visit \`/cso\` without a session → redirected to \`/login\`. Log in as REQUESTER and visit \`/cso\` → redirected. Log in as CSO → allowed through."
```

---

#### Issue 13 — Auth API routes

```bash
gh issue create \
  --title "feat: authentication API routes (login, OTP, register, activate, logout, reset)" \
  --label "backend,api,auth" \
  --milestone "Milestone 1 — Foundation: Supabase + Auth" \
  --body "## Summary
All auth-related route handlers. Completes the first working end-to-end user flow.

## Branch
\`backend/feat/13-auth-routes\`

## Routes
- \`POST /api/auth/login\` — email + password; MFA flag for CSO/HOD/VERIFIER
- \`POST /api/auth/verify-otp\` — completes MFA; returns full session
- \`POST /api/auth/logout\` — invalidates session
- \`POST /api/auth/reset-password\` — triggers Supabase password-reset email (no email enumeration)
- \`POST /api/auth/register\` — requester activation: token + passport photo upload + password
- \`POST /api/auth/activate-hod\` — HOD onboarding: token + signature + stamp + password + MFA setup

## Checklist
- [ ] \`POST /api/auth/login/route.ts\`
- [ ] \`POST /api/auth/verify-otp/route.ts\`
- [ ] \`POST /api/auth/logout/route.ts\`
- [ ] \`POST /api/auth/reset-password/route.ts\`
- [ ] \`POST /api/auth/register/route.ts\`
- [ ] \`POST /api/auth/activate-hod/route.ts\`
- [ ] All routes return \`{ data, error, status }\` envelope
- [ ] All routes use \`logger\` not \`console.log\`
- [ ] Connect login form (\`src/app/(public)/login/login-form.tsx\`) to \`POST /api/auth/login\`
- [ ] Connect forgot-password form to \`POST /api/auth/reset-password\`
- [ ] Update \`docs/BACKEND.md\` §14 + \`docs/CHANGELOG.md\`

## Verification
Full login flow works in browser: enter credentials → OTP email arrives → enter OTP → land on role dashboard."
```

---

### Milestone 2 — Request Workflow

#### Issue 14 — Request management API routes

```bash
gh issue create \
  --title "feat: request management API routes" \
  --label "backend,api" \
  --milestone "Milestone 2 — Request Workflow" \
  --body "## Summary
The full weekday + weekend request lifecycle from submission to collection. Most complex route group.

## Branch
\`backend/feat/14-request-routes\`

## Routes
- \`POST /api/requests/submit\` → calls \`create_request\` RPC
- \`GET /api/requests/my\` → cursor-paginated requester history
- \`GET /api/requests/pending\` → HOD pending queue
- \`POST /api/requests/hod-decision\` → \`approve_weekend\` or \`decline_weekend\` RPC
- \`GET /api/requests/cso-queue\` → escalated requests (PENDING_CSO)
- \`POST /api/requests/cso-decision\` → CSO approve/decline
- \`GET /api/requests/live-queue\` → VERIFIER initial load (CODE_ISSUED)
- \`POST /api/requests/collect\` → calls \`issue_key\` RPC
- \`POST /api/requests/cancel\` → cancel own CODE_ISSUED request

## Checklist
- [ ] All 9 route handlers created
- [ ] All Zod schemas validated before RPC call
- [ ] All responses use \`{ data, error, status }\` envelope
- [ ] Errors logged via \`logger\` with correlation IDs
- [ ] Wire requester dashboard form to \`POST /api/requests/submit\`
- [ ] Wire verifier code-input to \`POST /api/requests/collect\`
- [ ] Update \`docs/BACKEND.md\` §14 + \`docs/CHANGELOG.md\`

## Verification
Submit weekday request → verify \`requests\` row in DB with CODE_ISSUED status → collect with valid code → \`issue_key\` RPC called → audit_log entry present."
```

---

#### Issue 15 — Key transaction and admin API routes

```bash
gh issue create \
  --title "feat: key transaction and user admin API routes" \
  --label "backend,api" \
  --milestone "Milestone 2 — Request Workflow" \
  --body "## Summary
Key return, outstanding keys view, paginated history, mark-lost, and all user-administration routes.

## Branch
\`backend/feat/15-key-admin-routes\`

## Routes
- \`POST /api/keys/return\` → calls \`return_key\` RPC
- \`GET /api/keys/out\` → outstanding keys (CSO/VERIFIER)
- \`GET /api/keys/history\` → paginated history (CSO/HOD)
- \`POST /api/keys/mark-lost\` → RETIRED + incident entry
- \`POST /api/admin/users\` → calls \`provision_user\` RPC
- \`GET /api/admin/users\` → paginated list
- \`PATCH /api/admin/users/[id]/revoke\` → deactivate + invalidate session
- \`POST /api/admin/authorisations\` → nominate collector
- \`DELETE /api/admin/authorisations/[key_id]/[requester_id]\` → remove collector

## Checklist
- [ ] All 9 route handlers created
- [ ] Wire CSO Users page to \`POST /api/admin/users\` and \`GET /api/admin/users\`
- [ ] Wire verifier return flow to \`POST /api/keys/return\`
- [ ] Update \`docs/BACKEND.md\` §14 + \`docs/CHANGELOG.md\`

## Verification
Return a key via verifier UI → \`return_key\` RPC called → audit_log entry present → key disappears from outstanding list."
```

---

#### Issue 16 — Supabase Realtime subscriptions

```bash
gh issue create \
  --title "feat: supabase realtime subscriptions and offline guard" \
  --label "backend,realtime" \
  --milestone "Milestone 2 — Request Workflow" \
  --body "## Summary
Live updates for verifier queue and CSO dashboard. Connection status indicator. Offline banner with disabled destructive actions.

## Branch
\`backend/feat/16-realtime\`

## Files
- \`src/hooks/useRealtime.ts\` — generic subscription hook (table, filter, callback)
- \`src/hooks/useConnectionStatus.ts\` — green/amber/red dot state
- \`src/components/smartkey/OfflineBanner.tsx\` — persistent full-bleed warning

## Checklist
- [ ] \`useRealtime\` hook with exponential backoff reconnect (up to 30s)
- [ ] \`useConnectionStatus\` returning \`'connected' | 'reconnecting' | 'offline'\`
- [ ] \`OfflineBanner\` component: full-bleed, warning-soft background, 0px radius
- [ ] Wire verifier queue: new CODE_ISSUED requests appear in real-time
- [ ] Wire CSO dashboard: live key counts, anomaly feed, overdue counter
- [ ] Disable Issue/Return buttons while offline; tooltip: 'Available again when you reconnect.'
- [ ] \`aria-live='polite'\` region announces new queue items
- [ ] Update \`docs/BACKEND.md\` §14 + \`docs/CHANGELOG.md\`

## Verification
Open verifier dashboard → submit a request in another tab → request appears in queue within 500ms. Go offline → OfflineBanner appears → Issue button disabled."
```

---

### Milestone 3 — AI Risk Engine

#### Issue 17 — Rule-based risk scoring engine

```bash
gh issue create \
  --title "feat: rule-based risk scoring engine with unit tests" \
  --label "backend,ai" \
  --milestone "Milestone 3 — AI Risk Engine" \
  --body "## Summary
Pure TypeScript risk engine. Deterministic, fully explainable, no external API. Runs inside \`create_request\` RPC flow.

## Branch
\`backend/feat/17-risk-engine\`

## Files
- \`src/lib/ai/risk/rules.ts\` — 5 rules with configurable weights
- \`src/lib/ai/risk/thresholds.ts\` — tier boundaries from env vars
- \`src/lib/ai/risk/engine.ts\` — evaluates rules, returns \`{ tier, factors }\`
- \`src/lib/ai/risk/rules.test.ts\` — positive + negative case per rule
- \`src/lib/ai/risk/engine.test.ts\` — tier boundary + combination tests

## Rules
| Rule | Default weight |
|---|---|
| \`outside_operational_hours\` | 3 |
| \`outstanding_key_not_returned\` | 5 |
| \`weekend_without_memo\` | 4 |
| \`excess_request_frequency\` | 2 |
| \`collector_not_whitelisted\` | 5 |

## Checklist
- [ ] All 5 rule functions
- [ ] Engine aggregates weights and maps to tier
- [ ] Weights configurable via env vars
- [ ] Unit tests: every rule × positive + negative
- [ ] Engine tests: LOW/MEDIUM/HIGH boundary cases
- [ ] \`npm run test\` passes
- [ ] Update \`docs/BACKEND.md\` §14 + \`docs/CHANGELOG.md\`

## Verification
\`npm run test\` all green. Call engine with a request outside hours + outstanding key → tier HIGH, both factors listed."
```

---

#### Issue 18 — Risk tier UI components

```bash
gh issue create \
  --title "feat: RiskTierBadge and RiskFactorPopover components" \
  --label "backend,ai" \
  --milestone "Milestone 3 — AI Risk Engine" \
  --body "## Summary
Verifier-facing UI surfaces for the risk engine output. High-risk requests require explicit acknowledgement before Issue button is enabled.

## Branch
\`backend/feat/18-risk-ui\`

## Files
- \`src/components/smartkey/RiskTierBadge.tsx\` — pill: status colour + shield icon + tier label + 'View factors' link
- \`src/components/smartkey/RiskFactorPopover.tsx\` — lists contributing rules in plain English with weights

## Checklist
- [ ] \`RiskTierBadge\` for LOW / MEDIUM / HIGH tiers
- [ ] Each tier has status colour + icon + text label (colour never sole carrier)
- [ ] 'View factors' link opens \`RiskFactorPopover\`
- [ ] Popover lists each factor: rule name in plain English + weight
- [ ] HIGH risk: Issue flow inserts acknowledgement checkbox before confirm button
- [ ] \`aria-label\` on badge; keyboard-navigable popover
- [ ] Reduced-motion: no animation on badge enter
- [ ] axe-core passes in unit test
- [ ] Update \`docs/BACKEND.md\` §14 + \`docs/CHANGELOG.md\`

## Verification
Submit a HIGH-risk request → verifier queue shows red badge → click 'View factors' → popover lists rules → Issue button is greyed out until checkbox is checked."
```

---

### Milestone 4 — LLM + Signature

#### Issue 19 — Gemini shift report generation

```bash
gh issue create \
  --title "feat: Gemini shift report generation with template fallback" \
  --label "backend,ai" \
  --milestone "Milestone 4 — LLM + Signature" \
  --body "## Summary
Server-side only. Converts structured shift event data into readable narrative reports. Template fallback if Gemini is unavailable.

## Branch
\`backend/feat/19-gemini-reports\`

## Files
- \`src/lib/ai/reports/prompts.ts\` — structured prompt template
- \`src/lib/ai/reports/client.ts\` — Gemini REST call + TypeScript template fallback
- \`src/lib/ai/reports/parser.ts\` — parse Gemini output into \`{ markdown, timeline, metadata }\`
- \`POST /api/reports/generate/route.ts\`
- \`GET /api/reports/route.ts\`
- \`POST /api/reports/[id]/comments/route.ts\`

## Checklist
- [ ] Prompt template covers: summary, outstanding keys, flagged events, incidents, chain of custody
- [ ] Gemini call via \`@google/generative-ai\`; API key server-only
- [ ] Template fallback activated when Gemini unavailable or quota exceeded
- [ ] Output stored in immutable \`shift_reports\` row
- [ ] 'Generated by AI from shift event data' disclosure on every report
- [ ] CSO Reports page wired to \`GET /api/reports\`
- [ ] Comment form wired to \`POST /api/reports/[id]/comments\`
- [ ] Update \`docs/BACKEND.md\` §14 + \`docs/CHANGELOG.md\`

## Verification
Generate a report for a completed shift → report card appears in CSO Reports page → prose summary + timeline visible → add a comment → comment appears immutably."
```

---

#### Issue 20 — Signature verification and Supabase Storage

```bash
gh issue create \
  --title "feat: signature verification (Sharp + Pixelmatch) and Supabase Storage" \
  --label "backend,ai" \
  --milestone "Milestone 4 — LLM + Signature" \
  --body "## Summary
Pixel-level HOD signature comparison. Runs server-side. No GPU, no ML. Supabase Storage for all uploaded files.

## Branch
\`backend/feat/20-signature-storage\`

## Files
- \`src/lib/ai/signature/verifier.ts\` — Sharp preprocess (greyscale, 800×400) + Pixelmatch diff + mismatch ratio
- \`src/lib/ai/signature/verifier.test.ts\` — fixture image pairs: match, threshold-edge, mismatch
- \`POST /api/ai/verify-signature/route.ts\` — internal; called from \`approve_weekend\` flow

## Storage buckets
| Bucket | Who uploads | RLS |
|---|---|---|
| \`passport-photos\` | REQUESTER on register | Own read; VERIFIER read |
| \`hod-signatures\` | HOD on activate | Own read; CSO read; system write |
| \`weekend-letters\` | HOD on approval | Own dept; CSO |

## Checklist
- [ ] \`src/lib/ai/signature/verifier.ts\`
- [ ] \`src/lib/ai/signature/verifier.test.ts\` with 3 fixture pairs
- [ ] \`POST /api/ai/verify-signature/route.ts\`
- [ ] 3 Supabase Storage buckets with RLS policies
- [ ] \`activate-hod\` route: upload signature + stamp reference on onboarding
- [ ] \`approve_weekend\` flow: compare submitted vs reference; hold + CSO alert if mismatch > threshold
- [ ] CSO alert includes: reference image, submitted image, mismatch %
- [ ] \`npm run test\` passes for signature verifier
- [ ] Update \`docs/BACKEND.md\` §14 + \`docs/CHANGELOG.md\`

## Verification
Onboard an HOD → reference signature stored in Storage. Submit a tampered weekend approval → mismatch detected → approval held → CSO dashboard shows alert with images side-by-side."
```

---

### Milestone 5 — CSO Backend + Jobs

#### Issue 21 — Shift handover, incidents, and report routes

```bash
gh issue create \
  --title "feat: shift handover, incidents, and AI risk-alerts routes" \
  --label "backend,api" \
  --milestone "Milestone 5 — CSO Backend + Jobs" \
  --body "## Summary
Remaining API routes for shift management, incidents, and CSO live alerts.

## Branch
\`backend/feat/21-shift-incident-routes\`

## Routes
- \`GET /api/shifts/current\` — active shift + officer details
- \`POST /api/shifts/handover\` → calls \`acknowledge_shift_handover\` RPC
- \`GET /api/incidents\` — paginated, append-only (no update/delete endpoint)
- \`POST /api/incidents\` — new incident; trigger AI summary if severity HIGH
- \`GET /api/ai/risk-alerts\` — HIGH-tier requests from last 24h

## Checklist
- [ ] All 5 route handlers
- [ ] Shift handover screen locks dashboard until complete
- [ ] Bulk-acknowledge requires explicit confirmation dialog
- [ ] HIGH incident triggers AI summary generation
- [ ] Wire verifier Handover screen to \`POST /api/shifts/handover\`
- [ ] Wire CSO alert feed to \`GET /api/ai/risk-alerts\`
- [ ] Update \`docs/BACKEND.md\` §14 + \`docs/CHANGELOG.md\`

## Verification
Incoming verifier opens dashboard → handover screen appears → acknowledge all outstanding keys → dashboard unlocks. Log HIGH incident → AI summary generated and stored."
```

---

#### Issue 22 — Edge Functions (background jobs)

```bash
gh issue create \
  --title "feat: supabase edge functions (overdue key check + daily shift summary)" \
  --label "backend,ci/cd" \
  --milestone "Milestone 5 — CSO Backend + Jobs" \
  --body "## Summary
Scheduled Deno functions that run on the Supabase platform. No separate cron server needed.

## Branch
\`backend/feat/22-edge-functions\`

## Functions
| Function | Schedule | Action |
|---|---|---|
| \`overdue-key-check\` | Every hour (\`0 * * * *\`) | Calls \`mark_key_overdue()\` RPC → triggers CSO Realtime alert |
| \`daily-shift-summary\` | 18:00 daily (\`0 18 * * *\`) | Calls \`generate_shift_report\` for current shift |

## Checklist
- [ ] \`supabase/functions/overdue-key-check/index.ts\`
- [ ] \`supabase/functions/daily-shift-summary/index.ts\`
- [ ] Cron schedules registered in \`supabase/config.toml\`
- [ ] Both functions use service-role key (not anon key)
- [ ] Both functions log via structured output (not console.log in prod)
- [ ] Update \`docs/BACKEND.md\` §14 + \`docs/CHANGELOG.md\`

## Verification
\`supabase functions serve overdue-key-check\` → invoke manually → \`mark_key_overdue\` RPC fires → overdue key status updated → CSO dashboard counter updates via Realtime."
```

---

#### Issue 23 — CI/CD pipeline and testing setup

```bash
gh issue create \
  --title "feat: ci/cd pipeline (GitHub Actions) and testing configuration" \
  --label "ci/cd,testing" \
  --milestone "Milestone 5 — CSO Backend + Jobs" \
  --body "## Summary
Automated checks on every PR. Vitest for unit tests, Playwright + axe-core for E2E, Lighthouse CI for performance.

## Branch
\`backend/feat/23-ci-cd\`

## Files
- \`.github/workflows/ci.yml\` — typecheck → lint → unit tests → build (every PR)
- \`.github/workflows/e2e.yml\` — Playwright + axe-core against Supabase preview branch (every PR)
- \`playwright.config.ts\` — baseURL, retries=2 in CI, chromium + Pixel 5 projects
- \`vitest.config.ts\` — unit test config with \`@vitejs/plugin-react\`
- \`tests/e2e/\` — placeholder spec files per role

## Checklist
- [ ] \`.github/workflows/ci.yml\` (typecheck, lint, test, build)
- [ ] \`.github/workflows/e2e.yml\` (Playwright with Supabase preview)
- [ ] \`playwright.config.ts\`
- [ ] \`vitest.config.ts\`
- [ ] Placeholder E2E spec files: \`tests/e2e/cso/\`, \`tests/e2e/hod/\`, \`tests/e2e/verifier/\`, \`tests/e2e/requester/\`, \`tests/e2e/public/\`
- [ ] Lighthouse CI: key routes must score ≥ 85
- [ ] Update \`docs/BACKEND.md\` §14 + \`docs/CHANGELOG.md\`

## Verification
Open a PR → CI runs → all checks green. Push a type error → typecheck job fails and blocks merge."
```

---

## 4. Branch and PR conventions

### Branch naming

```
backend/feat/{issue-number}-{kebab-description}
backend/setup/{issue-number}-{kebab-description}
```

> **Note on issue numbers**: GitHub assigns issue numbers automatically based on how many issues already exist in the repo. The numbers shown in Section 3 (7–23) are illustrative — your actual numbers will depend on existing frontend issues. After running `gh issue create`, use the number GitHub prints (e.g. `https://github.com/.../issues/42` → branch is `backend/feat/42-schema-migrations`).

Create a branch and link it to an issue:

```bash
# Replace N with the actual issue number GitHub assigned
git checkout -b backend/feat/N-schema-migrations
git push -u origin backend/feat/N-schema-migrations
# Then go to the GitHub issue and set this branch as the development branch (right sidebar)
```

### Sub-issues (native GitHub)

For each issue that has sub-tasks you want tracked as their own issues:

1. Create the child issue first (e.g., "feat: profiles and departments migration")
2. Open the parent issue (e.g., Issue 8)
3. In the right sidebar under **Development**, click **Sub-issues** → **Add sub-issue**
4. Paste the child issue URL

The checklist approach in the issue body is sufficient for most tasks — only split into separate issues if a sub-task has its own assignee or distinct PR.

---

## 5. PR template

This is already created at `.github/pull_request_template.md`. Every PR body pre-fills with it.

---

## 6. Issue templates

Two templates are in `.github/ISSUE_TEMPLATE/`:

- `backend-feature.md` — for new features
- `bug-report.md` — for bugs

Use them when creating issues via the GitHub web UI (they appear as options when clicking **New issue**).

---

## 7. Work order summary

Issue numbers below are the actual GitHub issue numbers for this repo (`ayobami11/smartkey`). ✅ = merged to main, 🔄 = PR open/in review, ⬜ = not started.

> **Note**: this table was last updated well before `docs/BACKEND.md` §14's implementation-status table, which is meant to be updated after every merged PR and is the more current source. Statuses below were reconciled against §14 and against what actually exists in the repo (`src/lib/ai/reports/`, `src/lib/ai/signature/`, `supabase/functions/`, `.github/workflows/`) rather than re-verified live against GitHub — `gh` CLI isn't available in this environment. If the two tables disagree again in the future, trust §14 of `docs/BACKEND.md` and fix this one.

```
Milestone 1 — Foundation (all ✅ done)
  #9 (Supabase setup) → #10 (schema) → #11 (RLS) → #12 (RPCs) → #13 (client utils) → #14 (middleware) → #15 (auth routes)

Milestone 2 — Request Workflow (all ✅ done)
  #16 (request routes) → #17 (key/admin routes) → #18 (realtime + offline guard)

Milestone 3 — AI Risk Engine (all ✅ done)
  #19 ✅ (risk engine + unit tests) → #20 ✅ (RiskTierBadge, RiskFactorPopover)

Milestone 4 — LLM + Signature (all ✅ done)
  #21 ✅ (Gemini shift reports) → #22 ✅ (signature verification + Supabase Storage)

Milestone 5 — CSO Backend + Jobs (all ✅ done)
  #23 ✅ (shift/incident/report routes) → #24 ✅ (edge functions) → #25 ✅ (CI/CD pipeline)
```
