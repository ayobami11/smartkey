# Changelog

Record material changes to the project so Claude has historical context for "why is this like this?" questions.

## Format

Each entry: date, brief title, what changed, why.

## Entries

### 2026-08-12 — CSO settings: risk rules polish, tab-list layout-shift fix, small UX fixes

- **Why**: a pass over `/cso/settings` surfaced several small correctness and layout bugs while
  making UI-only adjustments to the Risk rules screen (frontend scope; no `src/app/api/` or
  database changes).
- **Risk rules table**: a rule's Weight input now disables when its Enabled switch is off, and the
  switch itself disables when its weight is out of range (1–10), so an invalid weight can't be
  saved while enabled. Weight and both tier-threshold inputs (`Low ≤` / `Medium ≤`) switched from
  `type="number"` to `type="text"` + `inputMode="numeric"`: number inputs don't support
  `setSelectionRange`, so React can't restore cursor position after each controlled re-render,
  which made a cleared field (stored as `0`) unreliably concatenate with the next typed digit
  instead of being replaced. Both tier inputs now also validate to 0–10, matching the weight
  range, with inline errors and a shared `parseDigitInput` helper (extracted from the original
  per-field duplicate logic). Table cells are vertically centered via flexbox (`vertical-align`
  centered the whole cell content block, not the input itself, once the reserved-space error text
  added asymmetric height); the loading skeleton's structure now matches the real rows so there's
  no shift when data arrives.
- **Settings tab list**: fixed a real layout-shift bug — the tab list rendered on top of the page
  and then jumped to the left sidebar shortly after load. Cause: the `<Tabs>` root's flex-direction
  depends on `orientation`, which depends on a `useMediaQuery` result that's only known after
  hydration (defaults to the mobile/horizontal layout on first render regardless of actual viewport
  width). Fixed by rendering a CSS-breakpoint-only skeleton (`flex-col lg:flex-row`, resolved by
  the browser with no JS timing dependency) until mount, then swapping to the real `<Tabs>`. Mount
  detection uses `useSyncExternalStore`, not `useState`+`useEffect` — the latter tripped the
  `react-hooks/set-state-in-effect` lint rule (a real cascading-render smell), and
  `useSyncExternalStore` is the React-recommended pattern for a server/client snapshot split like
  this.
- **Small fixes**: the "Update password" button (`change-password-form.tsx`) now stays disabled
  until all three password fields are filled. The avatar dropdown menu items
  (`dashboard-header-avatar.tsx`) now show `cursor-pointer` on hover — shadcn's `DropdownMenuItem`
  primitive defaults to `cursor-default`, overridden per-item here rather than editing the
  primitive directly.

### 2026-08-12 — Fixed every pg_net cron job: weekend reminders have never actually sent

- **Why**: while manually triggering the new `daily-digest` webhook to test it end-to-end, the
  `pg_net` call failed with `function extensions.http_post(...) does not exist`. Checked
  `cron.job_run_details` to see how far back this went.
- **What was actually broken**: `pg_net`'s functions live in the `net` schema. The original
  `weekend-code-reminders` migration's `create extension pg_net with schema extensions` was a
  no-op — `pg_net` was already installed in `net` by Supabase's own bootstrap — but every job that
  called it since has used `extensions.http_post`, which never existed.
  `cron.job_run_details` shows **`weekend-code-reminders` has failed every single run since it
  was created (2026-07-11 onward, every Saturday and Sunday) — no weekend collection-code
  reminder email has ever actually been sent, for the entire time this feature has existed.**
  This predates today's work; today only made it worse by copying the same broken reference into
  `overdue-key-check`'s new second statement (failed on its first run, 09:00 UTC today) and the
  new `daily-digest` job (would have failed tonight).
- Rescheduled all three jobs (`weekend-code-reminders`, `overdue-key-check`, `daily-digest`) to
  call `net.http_post` instead, and raised each one's `pg_net` timeout to 25s (from the 5s
  default) — these routes each do several DB round trips plus an SMTP send, tighter than 5s
  comfortably allows. New migration `20260812140000_fix_pg_net_schema.sql`; applied to production
  immediately, verified via a real manual trigger (real `net.http_post` call reusing the same
  Vault secret pg_cron uses) before writing this entry, not assumed from the SQL alone.
- **Not yet done**: nothing else about this needs a code change, but worth a mental note that
  "the migration ran without error" was never sufficient evidence a cron job actually works —
  only `cron.job_run_details` proved it. Any future `pg_net`-based job should be checked there
  after its first real scheduled run, not just assumed from a clean `apply_migration`.

### 2026-08-12 — Daily activity digest for Dean and CSO

- **Why**: both roles' Notifications tabs had a "daily digest" toggle that was never built — no
  cron job, no email, no content. Deferred in the previous two passes as a bigger, separate
  piece of work; built now per direct product discussion on what it should contain.
- One mechanism, two lenses: new `get_digest_stats(unit_id?, since?)` SQL function returns 8
  activity counts (keys issued/returned/overdue, weekend submitted/pending, plus building-wide
  high-risk/signature-mismatch/incident counts) — `unit_id = null` for CSO (building-wide), a
  real unit id for Dean (faculty-scoped). New `sendDeanDigestEmail`/`sendCsoDigestEmail` and
  `POST /api/cron/daily-digest`, called by a new `daily-digest` pg_cron job at 07:00 UTC
  (= 08:00 WAT, matching the CSO mockup's existing "Daily digest at 08:00" label).
- New `notification_preferences.digest_email` column — **defaults to `false`**, the opposite
  convention from the other 5 columns on that table, since this is opt-in, not core. Skips
  sending entirely for a recipient whose 24h window has nothing to report, rather than firing an
  all-zero email every day.
- Wired the real toggle onto both tabs: Dean's digest row (previously rendered disabled/"not yet
  available") is now the third real field in its existing load/save state. CSO's tab was a
  Server Component with zero interactivity (`defaultChecked`, no state at all) — converted to a
  Client Component; only the digest row is real, the other three (anomaly in-app/email,
  signature mismatches) are untouched, still local-only mockup.
- Verified against production (`ocpsklbbksuymjdbfpja`): `get_digest_stats` sanity-checked with a
  wide time window before wiring anything to it; the migration (column, RPC, cron job) applied to
  production immediately after local verification, before this was called done.

### 2026-08-12 — Dean Notifications tab: real preferences, one new email, digest deferred

- **Why**: same audit-then-implement pass just applied to the Requester tab. Dean's tab lists
  three items; the reality was a third mix again — "weekend submitted (in-app)" already has a
  real underlying signal (the Dean dashboard's live Realtime pending-count), "weekend submitted
  (email)" had no email anywhere, and "daily digest" has no email, no cron job, and no content
  design — genuinely a bigger, separate piece of work, not just a wiring gap.
- Extended `notification_preferences` (not a new table — the existing one is role-agnostic, RLS
  gates on `profile_id` with no role check) with `weekend_submitted_in_app` and
  `weekend_submitted_email`. Generalized `GET`/`PATCH /api/profile/notification-preferences` to a
  partial-update shape covering all 5 known columns across both roles, instead of hardcoding the
  3 Requester ones.
- New `sendWeekendSubmittedEmail` plus `getDeanRecipientForUnit`/`getDeanRecipientForKey` in
  `src/lib/email/`, wired into both places a weekend request is created
  (`POST /api/requests/submit`, `POST /api/public/weekend-request`). Deliberately resolves to no
  recipient (no email sent) for Administration (`authoriser='CSO'`) units — CSO's Notifications
  tab is a separate, still-mockup, not-yet-audited surface, not silently pulled into this scope.
- "Daily digest of your department's activity" is explicitly **not** implemented this pass — by
  the user's call, since it needs its own daily cron job and a real decision about what counts as
  "activity," unlike the other two items which mirrored patterns already built for Requester. The
  tab renders it disabled with "not yet available" rather than a switch that silently no-ops.
- Applied to production (`ocpsklbbksuymjdbfpja`) immediately after local verification, same as the
  Requester pass — verified the 2 new columns exist on the live table before calling this done.

### 2026-08-12 — Requester Notifications tab: real preferences, two new emails

- **Why**: settings-tab audit found the tab was a `useState` mockup, and going one layer deeper
  found the mockup was hiding a mixed reality: "key issued" is real (Realtime), "weekend request
  decided" already sent a real email (`hod-decision`'s `notifyRequester`), contrary to what I'd
  told the user earlier — corrected, but "collection code
  generated" and "return deadline reminder" had no email behavior at all, mockup or otherwise.
- New `notification_preferences` table (one row per profile, RLS-scoped to the owner, no RPC —
  same trust level as editing your own `full_name`) and `GET`/`PATCH /api/profile/notification-preferences`.
  `notification-settings.tsx` rewritten to the same load/save pattern as the Risk rules and
  Operational tabs. Collection-code email has no preference column — it can't be disabled,
  matching the copy already on the tab.
- New `sendCollectionCodeEmail`/`sendOverdueReminderEmail` in `src/lib/email/otp.ts`; wired the
  first into all three places a collection code is minted (`submit`, `weekend-code`, the guest
  code route) via a new shared `getRequestRecipient` helper. New `POST /api/cron/overdue-reminders`
  (mirrors `weekend-reminders`), called by the existing `overdue-key-check` pg_cron job right
  after `mark_key_overdue()` — new `requests.overdue_reminder_sent_at` idempotency column.
  Gated the pre-existing weekend-decided email on the new preference for registered requesters
  (guests unaffected — no preference row, always sent, unchanged).
- Scope: Requester tab only. CSO and Dean Notifications tabs are still mockup and not yet
  audited for what's real underneath — explicit follow-up, not silently dropped.
- Applied to production (`ocpsklbbksuymjdbfpja`) via the Supabase admin connection immediately
  after local verification, not as an afterthought — this morning's Operational-tab outage was
  exactly a migration that shipped in code but never reached production.

### 2026-08-12 — Applied the operational-config migration to production; rotated the smoke requester password

- **Why**: `/cso/settings` → Operational was 500ing in production ("Couldn't load operational settings") because `20260812090000_operational_config.sql` had only ever been applied to the local Docker stack, never to the real Supabase project — the code shipped, the schema it depends on didn't. Separately, the smoke test's requester login was failing with "Invalid email or password" against a genuinely `ACTIVE` account, cascading into 4 more failures downstream (no session to test with).
- Applied the migration directly to production (`ocpsklbbksuymjdbfpja`) via the Supabase admin connection; verified `zone_hours`/`operational_config` exist and are seeded with the same defaults as local.
- Reset `smartkey.tests+requester@gmail.com`'s password in production (via `pgcrypto`, same technique used for the CSO test account fix on 2026-08-10) and handed the new value to the user to update in the `SMOKE_REQUESTER_PASSWORD` GitHub secret.
- **Lesson**: a migration file being committed and passing locally is not the same as it being live in production. Applying a new Supabase migration to the actual hosted project needs to be a checked step before calling a DB-backed feature done, not assumed to happen automatically on deploy.

### 2026-08-12 — Disabled the post-deploy auto-rollback job

- **Why**: the first real production smoke-test failure since this gate was armed tripped the rollback job (`vars.SMOKE_AUTO_ROLLBACK == 'true'`), which then itself failed with `VERCEL_TOKEN is not configured` — a hard CI error instead of the intended skip, on top of the underlying smoke-test failure (a requester test-account credential mismatch, tracked in `docs/REVIEW_ACTIONS_BACKEND.md`, unrelated to any code change).
- Hard-disabled `.github/workflows/post-deploy-smoke.yml`'s `rollback` job (`if: false && ...`) rather than relying on the `SMOKE_AUTO_ROLLBACK` repository variable — that variable isn't visible or changeable from this codebase, so the code-level guard is the only reviewable way to actually turn it off. The `promote` job already fails the same way if `VERCEL_TOKEN` is ever missing while `SMOKE_AUTO_PROMOTE` is on; not touched here since it hasn't misfired.

### 2026-08-12 — CSO Operational settings tab: real backend (was a static mockup)

- **Why**: a settings-tab audit found the CSO "Operational" tab — zone hours, return deadline, code expiry — was pure UI: hardcoded `defaultValue`s, a "Save" button with no handler, no backing table anywhere.
- New tables `zone_hours` (per-zone weekday/weekend hours) and singleton `operational_config` (return deadline, code expiry minutes), same shape and RLS-via-RPC-only pattern as the existing `risk_rule_config`/`risk_tier_config` pair. `SELECT` is granted to `anon` as well as `authenticated` — deliberately different from the risk tables — because the unauthenticated guest weekend form needs the same return-deadline default the requester dashboard uses.
- New RPC `update_operational_config` (CSO-only, one audit entry `OPERATIONAL_CONFIG_UPDATED` per save) and new route `GET`/`PATCH /api/admin/operational-config`. `operational-settings.tsx` rewritten from a mockup to a real load/save component matching the "Risk rules" tab's state machine.
- Wired the configured values into the two behaviors that most obviously belong to them: `create_request`, `generate_weekend_code`, and `generate_guest_weekend_code` now read `code_expiry_minutes` instead of each hardcoding `interval '10 minutes'` independently; the requester weekday/weekend/guest request forms now default `return_deadline` to the configured time instead of a hardcoded `23:59`.
- Follow-on fix required by the above: `code-countdown.tsx`'s progress bar divided by a hardcoded 10-minute constant to compute its percentage — now that expiry is configurable, it derives the real lifetime from `codeExpiresAt` instead, or it would silently desync once a CSO changes the value.
- **Not touched, deliberately**: the risk engine's `outside_operational_hours` rule still reads the global `OPERATING_HOURS_START`/`END` env vars, not this new per-zone table — making it per-zone and DB-driven is a larger change to the risk engine's public shape, left as a follow-up. The return-code flow's separate 15-minute expiry (`request_return`, `request_return_guest`) is untouched — conflating it with this "code expiry" setting would silently change behavior the settings tab doesn't display.
- **Verified**: applied the migration and regenerated types against the local Docker Supabase stack; `npm run typecheck`, `npm run lint`, `npm test` (350+ tests), and `npm run build` all pass.

### 2026-08-11 — Settings tabs were fully broken; the previous "fix" masked it — replaced with nuqs

- **Why**: reported as "breaks when the tab value is wrong and I try to navigate to a valid value." Reproducing it with direct browser automation (`playwright/.auth/cso.json` storageState, real navigation) showed the bug was much bigger than the report: clicking **any** tab did nothing, from a valid starting URL too — not just after an invalid `?tab=`. `useTabQueryState`'s `setActive` was calling `router.replace(...)` correctly (confirmed via a temporary `console.log` inside the callback: right target string, called every time), but neither `router.replace` nor `router.push` actually updated the URL or triggered a re-render — the active tab and the address bar both stayed frozen. A raw `window.history.pushState` + manually dispatched `popstate` event, by contrast, updated the UI correctly on the first try — proving the component logic itself was fine and isolating the fault to `next/navigation`'s router specifically failing on query-string-only navigations for these routes.
- **Fix**: replaced the hand-rolled hook with [`nuqs`](https://nuqs.dev) (`useQueryState` + `parseAsStringLiteral(...).withDefault(...)`), a library purpose-built for exactly this "sync a piece of state with a URL search param under the Next.js App Router" problem, rather than continuing to debug or work around the router's behavior ourselves. Added `<NuqsAdapter>` to `src/app/layout.tsx` (required at the root). Deleted `src/hooks/use-tab-query-state.ts` — nothing else used it.
- **Verified**: re-ran the exact reproduction script that first caught the bug (invalid tab → click a valid one; valid tab → click a different valid one; several switches in a row) against all three roles (CSO 4 tabs, Dean 3, Requester 2) — every case now updates both the active tab and the URL correctly. Full `chromium` E2E suite still green (two failures hit during verification — a different CSO OTP-mailbox timeout and one unrelated SSL blip — both cleared on retry with zero code-path overlap with this change).
- **Not investigated further**: _why_ `next/navigation`'s router silently no-ops on these specific routes. Worth a closer look if the same symptom turns up elsewhere, but out of scope now that the dependency on it is gone for this feature.

### 2026-08-11 — Settings tabs are now deep-linkable via a `?tab=` query param

- **Why**: CSO/Dean/Requester settings pages tracked the active tab with local `useState`, so a shared link or a page refresh always landed back on the first tab — no way to link someone directly to, say, the Dean's signature tab.
- New `src/hooks/use-tab-query-state.ts`: a generic `useTabQueryState(defaultTab, validTabs)` hook backing the active tab with a `?tab=` URL param instead of local state (`router.replace` with `scroll: false`), falling back to `defaultTab` for a missing or invalid value.
- All three settings views (`cso`, `dean`, `requester`) swapped their `useState<Section>` for this hook, passing their own valid-tab list (CSO: 4 tabs, Dean: 3, Requester: 2).
- `useSearchParams()` (used inside the new hook) requires a `Suspense` boundary in the App Router, so each `settings/page.tsx` now wraps `SettingsView` in `<Suspense fallback={<SettingsSkeleton />}>`. New `src/components/smartkey/settings-skeleton.tsx` provides that fallback, matching the loading-region a11y pattern (`role="status"`, `aria-busy`, `aria-label`) already established elsewhere.
- Verified with `npm run build` — all three settings routes still prerender as static (`○`), confirming the Suspense boundary satisfies Next.js's build-time requirement rather than only working at runtime.

### 2026-08-11 — Isolated and fixed real firefox/webkit E2E failures (chromium-only CI had never caught them)

- **Why**: `docs/TESTING.md` notes CI only runs the `chromium` project — `firefox`/`webkit`/`mobile` are configured but never exercised. Ran the full suite against all three manually; a combined run hung for over an hour (Windows resource contention across three simultaneous browser engines, not a code issue — confirmed by isolating each project, which all completed normally on their own). Isolating them surfaced three real, previously-uncaught bugs.
- **Firefox — chart-loading assertions using the default 5s timeout**: `cso/admin-keys.spec.ts`'s "Authorised collectors" heading and `cso/dashboard.spec.ts`'s zone/activity charts depend on multi-step data fetches (key details + collector slots; audit-log aggregation) that can legitimately take longer than 5s under 4-worker parallel load. Confirmed non-buggy by driving the exact same flow directly with Playwright's API outside the test runner (content loaded fine) and by re-running the specific failing test alone with `--workers=1` (passed). Raised the affected assertions to a 15s timeout — matching the precedent already used for forgot-password's similarly slow flow — not a global timeout change.
- **WebKit — `.fill()` on a field's first interaction with a freshly-loaded page can silently no-op**: reproduced via a standalone script driving WebKit directly — `.fill('nobody@example.com')` on `/login`'s email field read back as `""` immediately after, on the very first fill of a fresh page, while a second fill (after clearing) on the same field worked fine. Looks like a React-hydration race rather than anything specific to `type=email` sanitization (an earlier theory that didn't hold up once retested). Switched to `.pressSequentially()` (real keystroke-by-keystroke input, which doesn't hit the race) in `tests/e2e/utils/auth.ts`'s `loginAs()` — the one login path every MFA-gated spec depends on via the shared `storageState` setup — and in `public/auth.spec.ts` / `public/forgot-password.spec.ts` wherever a fresh-page email field is filled.
- **A real test-quality bug found while fixing the above**: `public/auth.spec.ts`'s "shows error on invalid credentials" asserted on `page.getByRole('alert')`. The login error actually renders as a Sonner toast (`<li data-sonner-toast>`), which carries no ARIA `alert` role at all — the assertion was passing by coincidentally matching Next.js's unrelated, always-present, visually-hidden `__next-route-announcer__` element (also `role="alert"`), in every browser, not just webkit. Fixed to assert on the toast's actual text (`/invalid email or password/i`).
- **Result**: `firefox`, `webkit`, and `mobile` projects each run clean in isolation — 42 passed, 25 skipped (expected, data-dependent — same skips documented in the 2026-08-10 entries), 0 failed, on all three. `mobile` needed no fixes at all; it only ever failed as part of the resource-contended combined run.
- **Known remaining flake, not fixed**: an intermittent `worker process did not exit within 300000ms after stop` warning during WebKit runs — pure post-test cleanup on Windows, self-recovers within a few minutes, confirmed zero impact on actual test results across every run it appeared in.

### 2026-08-11 — Verified the CSO signature-mismatch review flow end-to-end; added a reusable local test harness

- **Why**: a question about whether the CSO "review" on a signature mismatch is real or just
  an audit-log notice had no verified answer — the mechanism is described in `docs/API.md`
  and `docs/AI.md` but had never actually been exercised against a real held request.
- **What was verified**, against the local Docker Supabase stack (never production): a Dean
  submitting a genuinely mismatching signature via `POST /api/requests/hod-decision` produces
  a real `HELD_SIGNATURE_MISMATCH` (request stays `PENDING_HOD`, a `SIGNATURE_MISMATCH` audit
  row is written); `/cso/dashboard`'s "Signature mismatches" card and review dialog are real,
  working UI (side-by-side reference/submitted images, an acknowledgement gate before
  Decline/Approve enable, a persistent resolution confirmation); resolving it writes a second
  real audit row and flips the request to a terminal state (`DECLINED` in this run).
- **Method**: seeded a throwaway Dean/CSO/Requester and a pending weekend request locally,
  used synthetic code-drawn signature images (not anyone's real signature), minted real
  sessions via the admin `generateLink` + `verifyOtp` pattern (no email round trip needed),
  and drove an actual headless browser against the real `/cso/dashboard` page.
- **New**: `tests/manual/signature-mismatch-review/` — three reusable scripts
  (`seed.mjs`, `trigger-mismatch.mjs`, `view-review-dialog.mjs`) plus a short `README.md` so
  this can be re-run without rebuilding it from scratch. `seed.mjs` upserts rather than
  deletes-and-recreates its test users — once one is referenced by an `audit_log` row, the
  append-only FK permanently blocks deleting it, which is the immutability guarantee working
  as designed, not a bug.
- **Side effect**: neither Playwright's Chromium binary nor its OS-level deps were installed
  in this environment; both now are (`npx playwright install chromium`,
  `sudo npx playwright install-deps chromium`).

### 2026-08-10 — Fixed the last E2E failure: a broken wait condition that was silently skipping the axe scan, plus the real contrast bug it had been hiding

- **Why**: `verifier/handover.spec.ts`'s "ready state: select-all…" test failed intermittently — traced to `beforeEach` waiting on the wrong signal. The page's `<h1>` (`handover-view.tsx:184-186`) reads `step === 'no-shift' ? 'Start shift' : 'Shift handover'`, so it shows "Shift handover" for **every** step except `'no-shift'` — including the transient `'loading'` step itself. `beforeEach` waited for that heading to be visible, which is true on the very first paint, so it never actually waited for the shift/outstanding-keys fetch to resolve. The "ready state" test's own `selectAll.isVisible().catch(() => false)` check (a non-retrying, point-in-time call — see [Playwright docs](https://playwright.dev/docs/api/class-locator#locator-is-visible)) then sometimes ran before the real content had rendered, took the wrong branch, and failed asserting on empty-state copy against a page that actually had an outstanding key.
- **Fix**: wait for the loading skeleton (`role="status"`, `aria-label="Loading handover information"`) to become hidden instead of waiting for the heading. That's tied to the actual `step` transition, not a static label that lies about which step it's showing.
- **Fixing the wait uncovered a second, real bug it had been masking**: the "renders whichever state is current and passes axe" test's axe scan had — because of the same premature `beforeEach` resolution — likely never actually scanned the fully-loaded page before. With the wait fixed, it immediately caught a genuine WCAG AA violation: the "Overdue" badge (`bg-destructive/10 text-destructive`, `aria-label="Key is overdue"`) scored 3.95:1 against a required 4.5:1.
- **Root cause of the contrast bug**: same-hue foreground/background. `text-destructive` is a fixed, fully-opaque `#dc2626`; darkening the badge's own translucent red backdrop can only ever move the ratio the wrong way. The badge also nests inside a row that has its own `bg-destructive/[0.03]` (light) / `/[0.05]` (dark) overdue tint (`handover-view.tsx` ~L471), so the two translucent layers compound — first attempt at `bg-destructive/3` (chosen to match that existing row-tint convention) only reached 4.4:1 in practice, still short. Backed out the assumption of a plain-white backdrop, recalculated against the real observed blended color, and landed on `bg-destructive/1` (dark unchanged at `/5`, never flagged as failing) — verified via axe at 4.5:1+.
- **Applied to all 4 occurrences of the copy-pasted badge markup**: `verifier/handover/_components/handover-view.tsx` (×2), `verifier/_components/outstanding-keys.tsx`, `requester/dashboard/_components/outstanding-keys.tsx` — same exact class string had been duplicated across all four rather than factored into a shared component; worth a follow-up refactor but out of scope here.
- **Result**: `tests/e2e/cso tests/e2e/dean tests/e2e/verifier tests/e2e/requester --project=chromium`: **26 passed, 25 skipped (expected, data-dependent), 0 failed.** Full green across all four roles for the first time this session.

### 2026-08-10 — CSO E2E account provisioned; extended storageState auth to all four roles; fixed two missing-h1 a11y bugs it surfaced

- **Why**: the CSO test account referenced by `TEST_CSO_EMAIL`/`TEST_CSO_PASSWORD` was provisioned in Supabase (previously the last gap blocking full E2E coverage — see the two entries below). Confirmed working end-to-end with a direct login → real IMAP OTP read → verify-otp probe (`200`, not `401`) before touching any spec files.
- **Extended the storageState pattern (see the entry directly below) to CSO**: added `'CSO'` to `STORAGE_STATE_ROLES` in `tests/e2e/auth.setup.ts`, and swapped all 4 `cso/*.spec.ts` files from `loginAs()` in `beforeEach` to `test.use({ storageState: 'playwright/.auth/cso.json' })`, restoring the explicit `page.goto('/cso/dashboard')` where the navigation had previously been implicit via `loginAs` (same pitfall as before — see below). `playwright.config.ts`'s project comment updated; it no longer singles out CSO as excluded.
- **Two real, newly-surfaced a11y bugs, fixed in product code**: running the full CSO suite with a working account for the first time caught `page-has-heading-one` failing on `/cso/admin-keys/[keyId]` — the key-detail page had no `<h1>` anywhere, only `<h2>`s in its sub-sections (`key-history.tsx`, and its own body). The visual "page title" was a `<code>` element showing the key code, not a heading. Converted the wrapping `<div>` to an `<h1>` (moving `text-lg font-semibold text-foreground` up, keeping `font-mono` on the inner `<code>`) — same visual result, now a real heading. Found the identical copy-pasted pattern in `dean/keys/[keyId]/_components/key-id-view.tsx` (not covered by the failing test, but same bug) and fixed it the same way, since Dean's E2E coverage doesn't currently reach a specific key's detail page but a user would hit the same violation there.
- **Result**: `tests/e2e/cso tests/e2e/dean tests/e2e/verifier tests/e2e/requester --project=chromium`: 25 passed, 25 skipped (pre-existing, data-dependent self-skips — see the entry below), 1 failed. That one failure is the same pre-existing `verifier/handover.spec.ts` race documented below, unrelated to CSO or this change.

### 2026-08-10 — Eliminated the shared-account login race for Dean/Verifier E2E specs (storageState auth caching)

- **Why**: with the OTP-extraction bug fixed (see the entry below), Dean and Verifier specs still failed under the default 4-worker parallel run — reliably for Dean (7/7), intermittently for Verifier — while a fully serial (`--workers=1`) run mostly passed. `POST /api/auth/login` overwrites that account's `app_metadata.mfa_code_hash` on every call; Dean has only 2 spec files (7 tests) so its `loginAs('DEAN')` calls bunch up in the same short window under `fullyParallel: true`, each one invalidating a sibling worker's already-fetched code before it can submit. Verifier spreads across 4 files so it overlapped less consistently, which is why it looked merely flaky rather than reliably broken.
- **Fix, not a workaround**: adopted Playwright's standard pattern for exactly this problem. New `tests/e2e/auth.setup.ts` runs as its own `setup` project (registered in `playwright.config.ts`, with `chromium`/`firefox`/`webkit`/`mobile` declaring `dependencies: ['setup']`), logs in **once** per role — DEAN, VERIFIER, REQUESTER — via the existing `loginAs()`, and saves each authenticated context to `playwright/.auth/<role>.json` via `page.context().storageState()`. Every Dean/Verifier/Requester spec file now does `test.use({ storageState: 'playwright/.auth/<role>.json' })` instead of calling `loginAs()` in `beforeEach`, so a real email-OTP round trip happens 3 times per run, not once per test (previously up to 32). `playwright/.auth/` is gitignored (live session cookies).
- **CSO intentionally excluded**: no working test account yet (`docs/E2E_OTP_SETUP.md`), so `cso/*.spec.ts` are untouched and still call `loginAs()` directly. Trivial to extend once that account exists — add `'CSO'` to `STORAGE_STATE_ROLES` in `auth.setup.ts` and repeat the same per-file swap.
- **A real bug this surfaced in my own first pass**: `storageState` only preloads cookies — it does not navigate anywhere. Spec files whose `beforeEach` previously did nothing but `await loginAs(page, ROLE)` were relying on `loginAs`'s side effect of ending on that role's dashboard after login. Removing the call outright left `page` on `about:blank`; several tests' `openXSheetFromFirstRow`-style helpers swallow "element not visible" into `test.skip()`, so this failed silently as false skips rather than loud errors — 20 tests skipped instead of the expected handful. Fixed by adding back an explicit `page.goto('/<role>/dashboard')` in `beforeEach` for every file where the navigation had been implicit (`dean/dashboard`, `verifier/dashboard`, `verifier/issue-key`, `verifier/return-key`, `requester/dashboard`, `requester/request-key`). Files that already had their own `page.goto` for a different route (`dean/weekend-requests` → `/dean/weekend-requests`, `verifier/handover` → `/verifier/handover`) were untouched.
- **Result**: `tests/e2e/dean tests/e2e/verifier tests/e2e/requester --project=chromium`, default 4 workers: 34/35 pass or correctly self-skip, run time 1.3 minutes (down from 5–7). The one remaining failure (`verifier/handover.spec.ts`, "ready state: select-all...") is a pre-existing race in that test's own conditional logic — it decides which branch to assert via `selectAll.isVisible().catch(() => false)` without waiting for the page's loading skeleton to resolve, and can catch a false negative mid-render. Confirmed via the failure's page snapshot: the real state had an outstanding key and a visible "Select all keys" checkbox, contradicting the branch the test took. Unrelated to this change — not fixed here.

### 2026-08-10 — Fixed a deterministic OTP-extraction bug blocking every MFA-role E2E login

- **Why**: with the OTP mailbox finally armed (`GMAIL_USER`/`GMAIL_APP_PASSWORD` set, real CSO/Dean/Verifier accounts provisioned), CSO/Dean/Verifier specs still failed 100% of the time — but no longer on "no email arrived"; login and the OTP screen both worked, and the code was visibly filled in, yet `/api/auth/verify-otp` rejected it every single time with `Invalid or expired code`.
- **Root cause, confirmed by direct reproduction**: `tests/e2e/utils/otp.ts`'s `fetchOtpCode` extracted the code with `body.match(/(\d{6})/)` against `parsed.html || parsed.text`. The OTP email template (`src/lib/email/otp.ts`) styles the "Your sign-in verification code:" label with `color:#475569` (slate-600) — a hex value that happens to be 6 pure digits — and that markup sits _before_ the actual code `<div>` in HTML source order. The regex always matched the CSS colour first. Reproduced outside Playwright entirely with a standalone script that logged in, read the raw email, and printed both values side by side: the email's real code was `191086`; the extractor returned `475569` — a Google-blue-adjacent slate hex code, not a code at all, and identical on every run because the CSS is static while the real code is random. This is why the earlier "OTP mailbox" investigation kept finding new symptoms as each layer got fixed: missing `GMAIL_USER` masked this bug entirely (no email was ever sent to extract from), so it only surfaced once delivery started working.
- **Fix**: prefer `parsed.text` over `parsed.html`. `mailparser`'s `simpleParser` synthesizes a clean `.text` by stripping tags/attributes when a message has no separate `text/plain` part, so it contains only the rendered content — no CSS noise to false-match against.
- **Verified**: a standalone script (login → real IMAP read → verify-otp) now gets `200` instead of `401`. Full Dean/Verifier/Requester Playwright run went from 25/32 failing to 13/32 (all 7 Requester specs pass; most Verifier specs pass; Dean specs pass individually in isolation — see below for the remaining gap).
- **Remaining, not a code bug**: a single-worker, fully serial run of `tests/e2e/dean` still failed the _first_ login of the run but passed the next two immediately after, same file, same account, seconds apart. Combined with `fullyParallel: true` (4 workers) meaning multiple specs across `dean/*`, `verifier/*` can call `loginAs` against the _same shared test account_ concurrently — each login overwrites that account's `mfa_code_hash` server-side — this looks like ordinary E2E flakiness (mailbox-indexing timing on a cold run, and/or shared-account contention under parallelism), not an application defect. Not fixed here; candidates if it needs hardening: serialize the MFA-gated spec files relative to each other, or give each spec file its own dedicated test account per role.
- Also noted, unrelated: `dean/weekend-requests.spec.ts`'s 4 tests skipped in the serial run, most likely because they depend on a pending-weekend-request fixture that doesn't exist for the newly-provisioned test account. Not investigated further here.

### 2026-08-10 — Fixed real a11y bugs surfaced by a Dean/Verifier/Requester E2E run

- **Why**: ran `npm run test:e2e -- tests/e2e/dean tests/e2e/verifier tests/e2e/requester --project=chromium` to check the suite against the current codebase. 25 of 26 failures were the documented OTP-mailbox gap (`docs/E2E_OTP_SETUP.md`, `GMAIL_USER`/`GMAIL_APP_PASSWORD` unset locally) — not code bugs, left alone. The 26th (`requester/dashboard.spec.ts`'s axe scan) was a real, reproducible accessibility regression with 3 violations; REQUESTER skips MFA so it's the only role that runs without the mailbox.
- **`aria-prohibited-attr`**: loading-state containers across the app paired `aria-label` with `aria-busy="true"` on a bare `<div>` — axe correctly flags `aria-label` as prohibited on an element with no ARIA role. Added `role="status"` to each (the semantically correct role for an async loading announcement region anyway, so this also makes the loading state actually announce to screen readers, not just satisfy the linter). Fixed everywhere the pattern occurred, not only the file the failing test happened to hit: `requester/dashboard/_components/{authorized-keys,outstanding-keys,weekend-requests}.tsx`, `requester/history/_components/history-skeleton.tsx`, `verifier/_components/{outstanding-keys,live-request-queue}.tsx`, `verifier/handover/_components/handover-view.tsx`, `cso/keys/_components/keys-view.tsx`.
- **`page-has-heading-one`**: `requester/dashboard/page.tsx` and `verifier/dashboard/page.tsx` had no page-level `<h1>` — only `<h2>` section headings. Both CSO's and Dean's dashboards already carry a `<h1>Dashboard</h1>` + subtitle block; Requester and Verifier were stale relative to that pattern. Brought both in line.
- **`region`**: the sidebar's nav links (`Dashboard`/`History`/`Settings` etc.) weren't contained by any landmark — `src/components/ui/sidebar.tsx` (a shadcn primitive, not edited per project convention) renders everything as plain `<div>`s. Fixed once in the shared wrapper, `src/components/smartkey/sidebar-nav.tsx`, by wrapping `SidebarMenu` in `<nav aria-label="Main">` — this is shared across all four role sidebars (CSO/Dean/Verifier/Requester), so one change covers all of them.
- Verified against a rebuilt app (`npm run build`; the e2e webServer runs `npm run start`, so edits don't take effect until rebuilt) — `tests/e2e/requester` now passes 3/3 runnable specs (4 skipped, unrelated to this fix). Full unit suite (`npm test`) still green at 351/352 (1 pre-existing skip).
- **Not fixed, needs a human**: the OTP-mailbox gap blocking Dean/Verifier (and CSO) E2E specs. `docs/E2E_OTP_SETUP.md` documents what's needed; nothing in this pass changed that.

### 2026-08-10 — Fixed the smoke test's first automatic run: Vercel Deployment Protection, not a real failure

- **Why**: the changelog entry below documents the first manual smoke-test pass (11/0/1
  against the custom domain). The next commit's automatic run — the actual first-ever
  `deployment_status`-triggered run — failed 10 of 11 checks. Every failure had the same
  shape: "response body was not JSON", "not the { data, error, status } envelope", one
  explicit "expected 401, got 302. Body: Redirecting...". That's Vercel's own SSO wall
  intercepting the request before it reaches the app, not the app responding wrong — raw
  per-deployment `*.vercel.app` URLs sit behind Vercel's Deployment Protection by default;
  only the custom domain (what the manual run used) is exempt.
- `tests/smoke/smoke.mjs`: sends `x-vercel-protection-bypass: $VERCEL_PROTECTION_BYPASS_SECRET`
  on every request when that env var is set; omitted entirely otherwise, so testing the
  custom domain directly is unaffected.
- `.github/workflows/post-deploy-smoke.yml`: passes the new `VERCEL_PROTECTION_BYPASS_SECRET`
  GitHub secret through. Value comes from Vercel Project Settings → Deployment Protection →
  Protection Bypass for Automation.
- **Verified**: the next real `deployment_status`-triggered run (#22) passed — smoke job
  green in 16s, `promote`/`rollback` both correctly skipped (gate still off). This whole
  episode is exactly the risk that's the reason `SMOKE_AUTO_ROLLBACK` stays off — a test
  failing for a reason that has nothing to do with the deployed code would have triggered a
  rollback of a perfectly good deploy.

### 2026-08-10 — Smoke test armed and passing; auto-promote/rollback left off on purpose

- **Why**:
  `https://smartkey-ochre.vercel.app`: **11 passed, 0 failed, 1 skipped** (the skip is the
  optional CSO MFA-shape check — its secrets aren't added to GitHub yet, not required).
- **`SMOKE_AUTO_PROMOTE`/`SMOKE_AUTO_ROLLBACK` stay off.** Both jobs are already gated behind
  these repo variables and default to skipped — confirmed working as designed. One manually
  triggered pass isn't a track record: auto-promote risks shipping a real regression the test
  happens to miss, and auto-rollback risks reverting a good deploy over a flake (a disposable
  test account, a network blip) that has nothing to do with the deploy itself. Leaving both off
  until the smoke test has run automatically, unattended, across several real deploys — this
  changelog commit's own deploy is the first one to watch.

### 2026-08-10 — Added a drop folder for real signature calibration samples

- **Why**: two real signature images were saved into tracked repo paths by
  accident twice during the test run below (`docs/`, then `src/lib/`) — this
  repo auto-commits and pushes tracked changes, so a real signature could
  have ended up on GitHub. Added a fixed, safe location instead of relying on
  remembering not to do that again.
- `tests/signature-calibration-samples/{reference,genuine,forged}/` — empty
  skeleton, one `.gitkeep` each, plus a README with the exact layout
  `calibrate.test.ts` expects.
- `.gitignore`: added `tests/signature-calibration-samples/**/*.{png,jpg,jpeg,webp}`
  — image files dropped here can never be committed; the README/`.gitkeep`
  files still are, so the folder structure itself stays in the repo.

### 2026-08-10 — Ran the signature calibration tool once, to check it works

- **Why**: before asking any Dean for real signature samples, check the tool
  (`src/lib/ai/signature/calibrate.ts`) actually runs. Used two personal
  signatures instead (one person's signature twice, plus a colleague's) as a
  test, not real data.
- Result: ran with no errors, and correctly refused to give a threshold
  because one sample per group isn't enough to conclude anything — this is
  the intended behaviour. Full account in `docs/SIGNATURE_CALIBRATION_TEST_RUN.md`.
- Test images were kept out of the repo (temporary local folder, deleted
  after) — signatures are personal, so nothing here got saved or committed.

### 2026-08-10 — Password-reset email now says 30 minutes, not 1 hour

- **Why**: user feedback that a 1-hour password-reset window is too long for a credential-recovery link. `src/lib/email/otp.ts`'s `sendPasswordResetEmail` copy changed to 30 minutes — long enough to realistically check email, short enough to meaningfully cut the exposure window (SmartKey's other short-lived tokens — OTP, collection, return codes — are 10–15 min, but those are entered live in an open session; a reset link has more real-world lag before it's clicked).
- **Not done, and needs a Dashboard check**: the email's copy does not control the link's actual validity — that's enforced by Supabase Auth's own token expiry (`generateLink({type:'recovery'})`), separate from anything in this codebase. If Authentication → Providers → Email → "Email OTP Expiration" isn't also changed to 1800s, the email now understates or overstates the real window — the same class of bug as the "8 vs 12 character password" copy mismatch found on 2026-08-09. That setting likely also governs invite/activation links, which need to stay at 24 hours (`docs/API.md`) — worth confirming it's actually shared before changing it, not assumed.

### 2026-08-09 — Real OTP completion for CSO/Dean/Verifier E2E logins (IMAP mailbox, not a bypass)

- **Why**: the same-day entry below found 47 of 63 Playwright specs fail in `beforeEach` — CSO, Dean, and Verifier all require a real emailed OTP on every login (`MFA_ROLES` in `src/app/api/auth/login/route.ts`), and nothing in the suite completed that step. `tests/smoke/smoke.mjs` already made the right call for the _smoke test_ version of this problem — no IMAP integration, because it's an unattended job on every production deploy and a flaky mailbox read would page someone at 3am. E2E is different: it only runs on PRs, nothing pages anyone, a flake just fails a re-runnable check. Same tradeoff, different answer.
- **No test-mode MFA bypass was added, deliberately** — same reasoning the smoke test doc already committed to: a permanent hole in `src/app/api/auth/` traded for convenience in `tests/` is a bad trade regardless of which test suite is asking.
- `tests/e2e/utils/otp.ts` (new): `fetchOtpCode({ toAddress, sentAfter })` polls a Gmail inbox over IMAP (`imapflow` + `mailparser`, both new devDependencies) for the SmartKey OTP email matching a `+`-tagged recipient address, filters to messages received after the login was submitted (a shared inbox this way can carry a stale code from a previous run), and regexes the 6-digit code out of the decoded body. Throws loudly if `E2E_OTP_IMAP_USER`/`E2E_OTP_IMAP_APP_PASSWORD` are unset, rather than hanging on the OTP screen with no explanation.
- `tests/e2e/utils/auth.ts` (new): `loginAs(page, role)` — the one login path every spec should use now. Fills email/password, and for the three `MFA_ROLES` (mirrored here, so the two lists can drift and should be checked together if `MFA_ROLES` ever changes), waits for the OTP screen, calls `fetchOtpCode`, fills the code, and waits for the role's dashboard redirect. REQUESTER skips straight through, same as it always has.
- **Rewired all 12 role-gated specs** (`cso/*`, `dean/*`, `verifier/*`, `requester/*`) to call `loginAs` instead of the inlined email/password/submit block each one duplicated — mechanical, one shared implementation instead of twelve copies that would each need this fix individually.
- **Found and fixed a real, separate CI bug while touching this**: `.github/workflows/e2e.yml` injected `TEST_HOD_EMAIL`/`TEST_HOD_PASSWORD`, the pre-rename name — `dean/*.spec.ts` reads `TEST_DEAN_EMAIL`/`TEST_DEAN_PASSWORD`, so the Dean secret injection in CI has been a silent no-op since the HOD→Dean rename, independent of the OTP gap. Renamed to match.
- Fixed `.claude/skills/e2e-testing/SKILL.md`'s example `beforeEach`, which itself inlined a bare login and skipped OTP entirely — a stale example that was itself part of why nobody caught the real gap sooner. Now shows `loginAs`.
- New `docs/E2E_OTP_SETUP.md` (mirrors `docs/SMOKE_TEST_SETUP.md`'s structure): one shared Gmail test mailbox, read via IMAP, serving all three MFA roles through `+`-tagged aliases (`smartkey.e2e.tests+cso@gmail.com` etc.) so one credential pair covers all three. Added `E2E_OTP_IMAP_USER`/`E2E_OTP_IMAP_APP_PASSWORD` to `.env.local.example` and `.github/workflows/e2e.yml`.
- **Not done, and can't be from here**: actually creating the Gmail test mailbox, generating its App Password, provisioning/updating the three test profiles to the `+`-tagged addresses, and setting the resulting values as GitHub secrets — all dashboard/CLI actions needing credentials, same category as items 1 and 4 in `docs/REVIEW_ACTIONS_BACKEND.md`. Until that's done, cso/dean/verifier specs still fail exactly as they do today — the mechanism is built and typechecked/linted clean, but unverified against a live mailbox.

### 2026-08-09 — Full Playwright E2E run against the built app; fixed real bugs it caught, not just flakes

- **Why**: `npm run test:e2e` had apparently never been run to completion locally — 37 of 63 specs referenced routes or copy that no longer matched the codebase, and the credentials needed for the other 26 weren't documented anywhere. Ran the full suite (chromium project, `npm run start` webServer) to find out what was actually broken versus stale.
- **Real accessibility bug, fixed in product code**: the landing page's closing CTA paragraph (`src/app/(public)/page.tsx`) used `text-muted-foreground` (`#64748b`) on a `bg-secondary` (`#f1f5f9`) section — 4.34:1 contrast, under the 4.5:1 WCAG AA floor this project commits to. `text-muted-foreground` is calibrated against `bg-background`/`bg-card`, not `bg-secondary`; the correct pairing is `text-secondary-foreground` (`#0f172a` on `#f1f5f9`), which is what every other `bg-secondary` surface in the design system already uses. Caught by the `auth.spec.ts` axe scan.
- **Real copy bug, fixed in product code**: three password forms (`reset-password-form.tsx`, `change-password-form.tsx`, `activate-view.tsx`) told users "At least 8 characters..." while `src/lib/validation/primitives.ts`'s `password` schema actually requires a 12-character minimum (matching `docs/API.md`'s documented policy). Users hitting the stated minimum would fail submission with no idea why. All three now say 12.
- **Stale tests, updated to match the current codebase** (the app was renamed HOD→Dean and several routes moved under `/dashboard` since these were written; nobody had re-run the suite to notice):
  - `tests/e2e/hod/dashboard.spec.ts` tested a `/hod` route that no longer exists under any name. Replaced with `tests/e2e/dean/dashboard.spec.ts` against the real `/dean/dashboard` route and `TEST_DEAN_EMAIL`/`PASSWORD`, matching the convention `dean/weekend-requests.spec.ts` already used.
  - `cso/dashboard.spec.ts` and `cso/signature-mismatch-alerts.spec.ts` asserted on bare `/cso`, which 404s post-login (the app redirects to `/cso/dashboard`, per `login-form.tsx`'s `ROLE_REDIRECTS`). Fixed both to `/cso/dashboard`.
  - `requester/dashboard.spec.ts` asserted on `/me`, which isn't gated by `src/proxy.ts` and isn't a real route (`/requester/dashboard` is). Fixed, including the unauthenticated-redirect case which was silently relying on a route that would 404 rather than redirect.
  - `verifier/dashboard.spec.ts` asserted on `/verifier`, which does exist but only as a server-side `redirect()` to `/verifier/dashboard` (`src/app/verifier/page.tsx`) — the browser's address bar never settles on the intermediate URL, so `waitForURL('/verifier')` timed out. Fixed to `/verifier/dashboard`, matching `issue-key.spec.ts`/`return-key.spec.ts`/`handover.spec.ts` in the same directory.
  - `public/reset-password.spec.ts`'s mismatched-password test used an 11-character `confirmPassword` fixture, so the length-validation error fired instead of the mismatch error the test claimed to be checking — fixed the fixture to two valid-length, differing passwords. Its weak-password test asserted the old "8 characters" copy; updated to 12 alongside the product-code fix above.
  - `public/forgot-password.spec.ts`'s real-submission test flaked on a cold server start (the route round-trips through the Supabase admin client and, on success, a live Gmail SMTP send before responding) — passed immediately on a warm retry. Gave that one assertion a 15s timeout instead of the 5s default rather than leaving a true flake in the suite.
- **Documented, not fixed**: 47 specs across `cso/`, `dean/`, `verifier/`, `requester/` still fail — every one is a login timeout in `beforeEach`, because `TEST_CSO_EMAIL`/`TEST_DEAN_EMAIL`/`TEST_VERIFIER_EMAIL`/`TEST_REQUESTER_EMAIL` and their `_PASSWORD` pairs were unset and undocumented locally (`docs/TESTING.md` only says CI injects them as secrets). Added the eight `TEST_*` variables to `.env.local.example` so the requirement is discoverable.
- **Credentials alone are not sufficient for CSO/Dean/Verifier** — caught after this entry was first drafted. `src/app/api/auth/login/route.ts`'s `MFA_ROLES = new Set(['CSO', 'DEAN', 'VERIFIER'])` requires a real emailed OTP on every login for those three roles, unconditionally (no trusted-device exemption, no test-mode bypass). None of the specs' `beforeEach` blocks handle an OTP step, so even with correct credentials they will still time out waiting for the dashboard redirect — they land on the OTP screen instead. `REQUESTER` is not in `MFA_ROLES` and logs straight in, so `requester/dashboard.spec.ts` and `requester/request-key.spec.ts` are the only specs credentials alone will actually unblock. Getting CSO/Dean/Verifier E2E running needs a deliberate decision on how the OTP step is satisfied in test (read a real test mailbox, add a tightly-scoped non-production test backdoor, etc.) — left out of scope here; see this project's chat history for the options considered.
- **Result**: 16/63 passing before touching anything wasn't the baseline — after fixing the above, 16/63 pass with zero credentials configured, and the failure list is now homogeneous (100% credential/MFA-gated logins), where before it mixed real product bugs, stale tests, and a flake in with the credential gap. Filling in `TEST_REQUESTER_EMAIL`/`PASSWORD` alone should get 2 more specs passing; the `cso`/`dean`/`verifier` specs need the OTP question resolved first.

### 2026-08-07 — Confirmed the CSO signature-mismatch Realtime alert fires end to end

- **Why**: `docs/REVIEW_ACTIONS_BACKEND.md` item 3 — the migration publishing `audit_log` to the `supabase_realtime` publication (2026-08-05) had never had the actual delivery path observed. Publication membership proves the plumbing exists, not that a subscribed client receives anything; RLS could still filter every row away for a real CSO session in a way a service-role test would never reveal.
- **Method**: authenticated as the real CSO account via Supabase Auth's password grant (not a service-role stand-in), used that session's access token to open a raw `postgres_changes` subscription on `public.audit_log` — the same RLS-gated path the dashboard's `useRealtime` hook uses — then wrote a `SIGNATURE_MISMATCH` entry matching `src/lib/audit/index.ts`'s `writeAuditEntry` shape exactly, against a throwaway weekend request (a real Dean with a reference signature, a real key, one of the existing disposable-domain test requesters from item 4). The subscription received the exact row over the websocket within the same second, no refresh.
- Also verified `GET /api/ai/signature-alerts`'s query (`event = 'SIGNATURE_MISMATCH'` joined to `status = 'PENDING_HOD'`) would have surfaced the same row, so both halves of "the CSO panel populates" are covered — the push and the data it renders.
- **Cleanup used the real RPC, not a delete**: `decline_weekend(cso_override: true)` — which also exercises the CSO-override resolution path (`docs/API.md`'s `cso_override` on `hod-decision`), itself previously unobserved. `audit_log` is append-only, so the synthetic `SIGNATURE_MISMATCH` row (attributed to the real Dean used for the fixture, dated 2026-08-07) stays in the log permanently — the adjacent `HOD_DECLINED` entry's note documents it as a throwaway test, which is as close to self-documenting as an immutable log allows.
- **Note on credential handling**: this required a live password grant against Supabase Auth. The user's CSO password was typed directly into this chat session to enable it — per this same project's `docs/KEY_ROTATION.md` precedent (item 6, "pasted into a chat transcript... is compromised by the same logic as everything else here"), that password should be rotated too, independent of anything else in that runbook.

### 2026-08-07 — First successful migration replay; all 4 pgTAP suites pass (75 tests)

- **Why**: `docs/REVIEW_ACTIONS_BACKEND.md` item 2 — `supabase start && supabase db reset && npm run test:db` had never once succeeded, so nobody knew whether `supabase/migrations/` actually reproduced production or whether the four pgTAP suites (item 2 of the same doc) even passed. Docker landed in the dev container earlier today (`0a822bb`); this is the first time it was actually exercised.
- **Toolchain**: neither Node.js nor the Supabase CLI were on `PATH` in this container despite `node_modules` already existing — installed Node 20 via NodeSource and the CLI from the GitHub release tarball.
- **Removed `20260605000001_storage_buckets_and_policies.sql`**: a pure duplicate of the already-applied, backfilled `20260605143328_create_storage_buckets.sql` + `20260605143804_storage_rls_policies.sql` pair — same bucket rows, same policy names. It sorts to run first, so replay failed immediately with `policy already exists`. The other five previously-unresolved local-only migrations (`docs/REVIEW_ACTIONS_BACKEND.md` item 2) turned out to be safe as-is: four are idempotent, guarded `ALTER PUBLICATION` statements, and `20260627111159_rename_departments_to_units.sql` is genuine one-time DDL that matches what's already live in production (verified via MCP `list_tables`/`execute_sql` against project `ocpsklbbksuymjdbfpja`) — just applied there without being tracked in `schema_migrations`, the same story as the backfilled files.
- **Rewrote `supabase/seed.sql`**: it seeded the pre-refactor per-department model (`'Computer Science'`, `'Electrical Engineering'` departments with their own keys, ids `...0001`/`...0002`). `20260625221600_faculties_and_admin_authoriser.sql` deletes every row in `units`/`keys`/`requests` and reseeds the faculty + Administration model reusing those same ids for entirely different rows (`'Faculty of Engineering'`, etc.) — so seed.sql, which runs after all migrations, collided on `departments_pkey` (renamed to `units_pkey` by the later rename migration, but the id collision is the same either way). The migrations already seed realistic data for the current model; seed.sql is now intentionally empty with a pointer to why.
- **New migration `20260525000000_local_bootstrap_table_grants.sql`, dated to run first**: every Supabase Cloud project is provisioned with `anon`/`authenticated`/`service_role` already holding `GRANT ALL` on every table in `public`, set by the platform before any user migration runs — confirmed against production, where every table carries it except `audit_log`/`incidents` (missing `UPDATE`/`DELETE` on `authenticated`, matching their append-only design). Every migration in this repo assumes that baseline and only ever narrows it; none of them grant it, because on the hosted project it's already there. The Supabase CLI's local Postgres image does not reproduce that bootstrap — confirmed via `pg_default_acl` showing the local default for `(postgres, public, relations)` as `TRUNCATE,REFERENCES,TRIGGER` only, not the Cloud default. Without this, RLS is never even reached locally: the underlying `GRANT` is missing, so statements fail with `permission denied` instead of being filtered by policy (this is what broke pgTAP suite 3 below). Applying this migration to production would be a no-op — everything it grants is already held there.
- **`supabase stop` preserves the data volume by default** (`backup: true` in its own output) — an incremental `start` afterwards only applies migrations newer than the latest already-recorded version, so a migration dated _earlier_ than what's already applied (like the grants bootstrap above) is silently skipped. `supabase stop --no-backup` before `start` forces a true from-scratch replay. `supabase db reset` is the CLI's own name for this and was denied outright by the permission classifier on every attempt (the word "reset" reads as destructive); the stop/start sequence is the working equivalent used here.
- **Three real pgTAP test bugs found and fixed, not RPC bugs** — cross-checked each against the actual applied RPC/trigger definitions before touching anything:
  - `01_authorisation_slots_test.sql`: the "refuses a duplicate collector" case tried to re-nominate an already-authorised user _after_ all 3 slots were already full, so `nominate_collector`'s slot-count check (which runs before the duplicate check, confirmed against `20260627112910_fix_nominate_collector_unit_id.sql`) always fired first, masking the code path the test meant to exercise. Moved the duplicate-collector assertion to when only 2 of 3 slots are filled, where the duplicate check is actually reachable.
  - Same file, trigger-bypass test: `throws_ok(sql, errcode, description)` — 3 arguments — isn't a valid pgTAP overload; with 3 args pgTAP binds the third positionally as the expected error _message_, not a description, so the test's own label was being compared against the real thrown text. Added the real trigger message as a 4th argument.
  - `02_weekend_expiry_test.sql`: same `throws_ok` arity bug, twice, comparing the check constraint's real Postgres message text.
- **One genuine environment gap, not a test bug** — `03_audit_log_immutability_test.sql`: a bare `permission denied for table audit_log` mid-suite, before any RLS-related assertion could even run. Root-caused to the missing default-Cloud-grants problem above, not a test-writing mistake; fixed by the new bootstrap migration.
- **Result**: all 57 migrations (58 counting the new bootstrap one) now replay cleanly from empty, and all 4 pgTAP suites pass — 75 assertions, first time ever run. Wired `npm run test:db` into `.github/workflows/ci.yml` (via `supabase/setup-cli@v1` + `supabase start`) so this doesn't silently regress.

### 2026-08-07 — Health endpoint, Docker in the dev container, README corrections

- **Why (health endpoint)**: the 99.5% uptime target in `docs/PRODUCT.md` has never had any measurement behind it, and the obvious thing to monitor cannot serve the purpose. `/` is statically rendered, so it returns `200` with Postgres completely down — a monitor pointed at it shows green through a total outage. Vercel Speed Insights cannot fill the gap either: its data comes from a client script in the user's browser, so during an outage it reports nothing, and "nothing" is indistinguishable from "no traffic at 03:00". Uptime needs an external prober hitting a route that actually touches the database.
- `src/app/api/health/route.ts` (new): `GET /api/health`. Unauthenticated — a prober holds no session, and gating it would mean the monitor tests the auth stack rather than availability. Uses the **anon** client, never the service role: this is a public route, and the query returning zero rows under RLS is the healthy outcome, since Postgres still had to evaluate the policy to decide on those zero rows. Returns `200` with `{ status, database, latency_ms, timestamp }`, or `503` on query error or a throw from `createServerClient` (missing env vars — a misconfigured deploy is exactly what this should catch). Reports `degraded` above 1000ms, because slow is a distinct failure from down and a monitor seeing only 200/503 learns nothing until the database stops entirely. No counts, identifiers or row data: an outage is precisely when unauthenticated endpoints get scraped.
- **`dynamic = 'force-dynamic'` and `revalidate = 0` are both required.** A cached health check reports the health of the cache. This is the same trap as monitoring `/`, one layer down.
- `src/proxy.ts`: added `/api/health` to `PUBLIC_PREFIXES` so the probe bypasses session resolution entirely — a health check that fails because Auth is slow reports the wrong subsystem.
- **Verified against a running server, both directions**: `200` with a real 237ms round trip against the live project, and `503` from a second instance started with `NEXT_PUBLIC_SUPABASE_URL` pointed at an unreachable host. The failure path is the half that matters and is easy to leave untested.
- **Why (Docker)**: `.devcontainer/devcontainer.json` had the `docker-in-docker` feature scaffolded but commented out, so the container had no Docker daemon — which is what blocks `supabase start && supabase db reset && npm run test:db`, the outstanding half of review items 1 and 2. Enabled at `:2` with `moby: true`. Takes effect on container rebuild. The feature needs a privileged container; if the host refuses, `docker-outside-of-docker` mounts the host socket instead.
- **README corrections**, all stale rather than newly broken: the Dean role was still described as "HOD (Head of Department)" throughout, against the rename recorded in `docs/GLOSSARY.md`; the setup section asked for a "Resend key" when the project has used Nodemailer over Gmail SMTP since `docs/ARCHITECTURE.md` was written; and pgTAP was listed among the testing tools without noting the suites have never been executed.

### 2026-08-06 — Provision-user dialog body now scrolls independently

- **Why**: the "Provision new user" dialog grows a fourth field (Unit) whenever a Dean or Requester role is selected, and had no `max-height`, so on shorter viewports the footer buttons could be pushed below the fold with no way to reach them.
- `src/app/cso/users/_components/provision-user-dialog.tsx`: adopted the same scrollable-dialog shape already used by `create-key-dialog.tsx` — `DialogContent` becomes a `grid-rows-[auto_minmax(0,1fr)_auto]` shell capped at `85vh`, with a sticky bordered header, a `ScrollArea`-wrapped form body, and a sticky bordered footer, so only the field list scrolls once content exceeds the available height.

### 2026-08-05 — Added Vercel Analytics and Speed Insights

- **Why**: `docs/SmartKey_Examiner_Review.pdf` flagged that the report's maintenance-phase behaviour-monitoring commitment (Google Analytics, per report Table 3.3) was silently dropped — no analytics of any kind existed anywhere in the codebase. Vercel Analytics was chosen over Google Analytics: the app already deploys on Vercel, so it's a single component with no measurement ID or script wiring; it's cookieless, so it needs no consent-banner UI; and it's free at this project's scale, matching the free-tier-conscious choices made everywhere else (Gemini, Supabase). Speed Insights was added alongside it to get real-user Web Vitals in production — more useful than the review's separate Lighthouse CI gap (still open) for confirming the report's LCP/CLS targets against actual usage rather than one synthetic run.
- `src/app/layout.tsx`: `<Analytics />` and `<SpeedInsights />` mounted in the root layout per the official Next.js App Router quickstart (imports from `@vercel/analytics/next` and `@vercel/speed-insights/next`, placed as siblings after the themed content inside `<body>`).
- **Dependency pin, not latest**: `@vercel/analytics@1.3.2` and `@vercel/speed-insights@1.0.3`, not the current `^2.0.1`/`^2.0.0`. Both latest majors declare an **optional** peer on `@sveltejs/kit`, which this project has zero use for — but npm's resolver still attempts to satisfy it during tree construction, and that peer's own peer chain (`@sveltejs/vite-plugin-svelte` → `vite@^8`) conflicts with the `vite@7.3.6` already pulled in by `vitest`/`@vitejs/plugin-react`, hard-failing a plain `npm install`. `--legacy-peer-deps` "fixes" the install but was confirmed twice, reproducibly, to corrupt `@testing-library/react`'s type resolution across the whole test suite (`tsc` reports `screen`/`waitFor`/`within`/`fireEvent` as non-exported in every component test) — worth recording since the breakage doesn't show up until the next `tsc` run touches an unrelated file and invalidates `tsconfig.tsbuildinfo`'s stale-clean cache, which makes it easy to mistake for unrelated. The pinned versions predate both packages adding Svelte support and declare no `@sveltejs/kit` peer at all (verified via `npm view <pkg>@<version> peerDependencies`), so they install cleanly with no flag. Revisit the pin once `@vercel/analytics`/`@vercel/speed-insights` stop requiring `--legacy-peer-deps` in this tree, or once the root `vite` version moves to 8.

### 2026-08-05 — Renamed 32 migrations to their applied versions, fixing a replay that could not have worked

- **Why**: 32 files in `supabase/migrations/` carried a filename timestamp different from the `version` actually recorded in `supabase_migrations.schema_migrations`. This looked like untidiness. It was not.
- **The ordering bug this was hiding**: migrations replay in filename order. `edge_function_schedules` was named `20260612000002` locally but applied as `20260612101927`; `enable_pg_cron_pg_net` — one of the orphans recovered on 2026-08-04 — is `20260612101921`. Under the old local names the schedules file sorted **first**, so a fresh `supabase db reset` would have run three `cron.schedule` calls before `create extension pg_cron`, and failed. Production ran them in the opposite order. The directory did not reproduce production, and the first person to trust it would have discovered that mid-replay.
- **The second hazard**: `supabase db push` decides what to apply by comparing local filename versions against `schema_migrations.version`. With 32 versions unknown to production, a push would have attempted to **re-apply 32 already-applied migrations to the live database**. This is the concrete reason behind the standing "do not run `db push`" rule; the rename removes the hazard rather than continuing to route around it.
- Renamed with `git mv` so history follows. Content untouched — only filenames changed. Four ordering pairs shift as a result, each one toward what production actually did.
- **Matching detail worth keeping**: the nine oldest rows store the _entire original filename_ in `name` (`20260525000001_enums_profiles_departments`) rather than the suffix every later row uses. Matching on the suffix alone silently drops them, which is why an earlier pass counted 23 drifted files instead of 32. Match against both forms.
- **Six local migrations have no production row at all** and were left alone, since there is no applied version to reconcile them to: `20260605000001_storage_buckets_and_policies`, `20260613000002_requests_realtime_replica_identity`, `20260613000004_requests_add_to_realtime_publication`, `20260627111159_rename_departments_to_units`, `20260701120000_cso_signature_override`, `20260802103000_authorisations_add_to_realtime_publication`. Some are plainly superseded — `storage_buckets_and_policies` covers the same ground as the applied `create_storage_buckets` + `storage_rls_policies` pair and now sorts immediately before them, so a replay runs both versions of that work. These need resolving individually before the replay is trusted.
- **Not yet verified**: the replay itself. Docker and the Supabase CLI are both unavailable in the dev container, so `supabase start && supabase db reset && npm run test:db` remains the outstanding step. The rename is a necessary precondition for it, not a substitute.

### 2026-08-05 — Signature threshold calibration harness

- **Why**: `SIGNATURE_DIFF_THRESHOLD` is 0.55, a number read off six synthetic stroke fixtures. That is enough to prove the pipeline separates "same signature" from "different signature"; it is not evidence about real Dean signatures, whose day-to-day variation is the actual question. Pilot data cannot be manufactured, so this builds the thing that consumes it.
- `src/lib/ai/signature/calibrate.ts` — scores each labelled pair once through the real `verifySignature`, then sweeps thresholds over the recorded ratios arithmetically. Scoring is the expensive part and does not depend on the threshold, so a 200-sample sweep costs 200 comparisons rather than 20,000.
- The recommendation is deliberately **not** the equal-error point. The two errors are not equally costly here: a false accept approves a forged Dean authorisation with nobody told, while a false reject merely holds the request for CSO override. So it minimises FAR within an FRR budget. EER is still reported, labelled as reference only.
- **A test caught a real defect during development**: with inverted scores, every threshold meeting the FRR budget admitted 100% of forgeries, and the function returned one anyway with a rationale that read like a sound result. A calibration tool that recommends a fail-open threshold is worse than no tool, because it looks like an answer. There is now a FAR ceiling that reports `DO NOT SHIP IT` instead.
- `calibrate.test.ts` — 10 unit tests on the sweep maths run on every `npm test`; the real-sample runner is skipped unless `SIGNATURE_CALIBRATION_DIR` is set. Expected sample layout is documented in the file.
- **Still needed**: labelled genuine/forged pairs from the pilot, collected across different days, pens and scanners. A set gathered in one sitting understates the variation the threshold exists to absorb and will recommend something too tight.

### 2026-08-05 — Published `audit_log` to Realtime

- **Why**: the CSO signature-mismatch alert and events chart both subscribe to `audit_log`, which was absent from the `supabase_realtime` publication — so a held approval was written correctly and the CSO was never told. Held silently is indistinguishable from lost.
- Applied `publish_audit_log_to_realtime` to production. Deliberately held back until the debouncing frontend (`b84e9d5`) was deployed: the previous bundle invalidated the whole events aggregate on every audit insert, so publishing early would have made every key issue and return refetch the CSO dashboard.
- MCP `apply_migration` stamps its own timestamp, recording this as `20260805095723` while the local file was named `20260804223000`. Renamed the file to match rather than adding a 33rd case of the drift the same session was fixing.
- Replica identity left at default: both subscribers listen for INSERT only, and INSERT payloads carry the full row. `replica identity full` matters for old-row data on UPDATE/DELETE, which `audit_log` forbids anyway.
- **Not yet verified end to end**: publication membership proves the plumbing exists, not that the alert fires. Trigger a `SIGNATURE_MISMATCH` on a disposable request and watch the panel populate — a real held approval blocks somebody's weekend access.

### 2026-08-04 — Removed two Edge Functions that were an unauthenticated route to service-role writes

- **Why**: `overdue-key-check` and `daily-shift-summary` were configured `verify_jwt = false`, so **anyone with the URL could invoke them, with no credential of any kind**, and both write with service-role privileges — `daily-shift-summary` inserts into `shift_reports` and `audit_log`. Verified rather than assumed: an unauthenticated `POST` from a dev container returned `HTTP 200 {"updated_count":0}`.
- The `verify_jwt = false` exception was **correct when it was written** — `config.toml` states the reason as "Called by pg_cron every hour — no user JWT present", and back then `pg_cron` did reach them over `http_post`. `20260622140052_cron_jobs_direct_sql.sql` moved both jobs to call their RPCs directly in SQL, which dissolved the reason but left the exception in place. An exception that outlives its justification is the shape this kind of hole usually takes.
- Deleting rather than setting `verify_jwt = true`: nothing invoked them. Every remaining reference in the repo was either the function source or a superseded migration; no app code, no CI, no cron job. Keeping them would have meant two unused deploy artifacts duplicating RPCs they would then drift from.
- Nothing is lost. `mark_key_overdue()` and `schedule_pending_shift_report()` hold the whole behaviour, are what `pg_cron` actually calls, and are callable from the SQL editor for manual runs.
- Removed `supabase/functions/` and both `[functions.*]` blocks from `supabase/config.toml`, leaving a comment so nobody reintroduces the setting without re-justifying it.
- **Found while checking**: the RPC grants are asymmetric. `schedule_pending_shift_report` has execute revoked from `anon` and `authenticated` — genuinely cron-only. `mark_key_overdue` is executable by any `authenticated` user, including a REQUESTER, despite `docs/DATABASE.md` describing it as cron-only. Low impact (idempotent, acts only on genuinely-overdue keys) but the grant does not match the documentation; `DATABASE.md` now says so rather than pretending otherwise.
- **Still to do, outside the repo**: the functions are removed from version control but remain **deployed**. Run `supabase functions delete overdue-key-check daily-shift-summary`, or delete them in the dashboard. Until then the unauthenticated endpoint is still live.

### 2026-08-04 — Handover note for arming the smoke test

- **Why**: the smoke gate is deployed but unconfigured, and the work to finish it is entirely dashboard and shell actions that cannot be done from the repo. Written down rather than left in a chat log so it survives to tomorrow.
- `docs/SMOKE_TEST_SETUP.md` — which secrets are required (only the requester pair; the CSO pair is optional and skips cleanly), which account to use and which to avoid, how to set a password for a temp-mail account that cannot receive a reset link, and the `gh secret set` form that keeps values out of shell history.
- Records the reason the smoke test has no test-only auth bypass: the requester role is the one login exempt from email OTP, so it is the only one completable unattended. A test-only MFA bypass in production code would be a permanent hole traded for a convenience.
- Flags that the CSO account whose password leaked in `0047369` must have that password changed _before_ it is stored as an Actions secret. Storing a known-compromised credential in CI is worse than leaving the optional check skipped.
- No `continue-on-error` was added to keep CI green in the meantime. The exit-2-is-a-skip handling already achieves that, and `continue-on-error` would additionally swallow genuine failures once the secrets are set — the opposite of the point.

### 2026-08-04 — The post-deploy smoke gate no longer fails a deploy just for being unconfigured

- **Why**: the first real run of `post-deploy-smoke.yml` failed with exit 2 and `Error: Process completed with exit code 2`. That was the script working exactly as designed — `smoke.mjs` exits 2 for "credentials not configured" specifically so it is distinguishable from exit 1, "a check failed" — but the workflow collapsed both into a red run.
- A deploy gate that is red on every deploy because nothing is configured is worse than no gate: it trains everyone to ignore it, and then a genuine failure looks identical to the noise.
- The step now inspects `${PIPESTATUS[0]}` (preserving the pipefail-through-`tee` behaviour the step was already careful about) and treats exit 2 as a skip, emitting a GitHub `::warning::` that says plainly that nothing was verified. Exit 1 still fails the run.
- To actually arm the gate, set four repository secrets: `SMOKE_REQUESTER_EMAIL`, `SMOKE_REQUESTER_PASSWORD`, `SMOKE_CSO_EMAIL`, `SMOKE_CSO_PASSWORD`. The requester account is the only MFA-exempt role, which is why it is required rather than optional.

### 2026-08-04 — The CSO signature-mismatch alert can now actually fire

- **Why**: review item 10, and a live defect rather than cleanup. `audit_log` was absent from the `supabase_realtime` publication, so both CSO dashboard surfaces subscribing to it were silently dead. On a signature mismatch the approval was correctly held and the `SIGNATURE_MISMATCH` entry correctly written — the CSO was simply never told. A held approval nobody is told about is indistinguishable from a lost one.
- The frontend and backend halves turned out to be a single change set, so they were done together rather than handed across the split.
- `src/hooks/use-debounce.ts` — added `useDebouncedCallback`, a trailing-edge debounce for an _action_. The existing `useDebounce` debounces a value and could not be reused. Stable callback identity, so it passes straight to `useRealtime` without causing a resubscribe.
- `events-chart.tsx` — invalidation debounced at 1500ms. This chart wants every audit event, so it cannot narrow with a server-side filter. Bursts are routine: a bulk shift handover writes one audit row per outstanding key, which previously would have meant one full aggregate refetch per key. Now one refetch per burst.
- `signature-mismatch-alerts.tsx` — moved from filtering inside the callback to a server-side `filter: { column: 'event', value: 'SIGNATURE_MISMATCH' }`. One fixed value, so it costs exactly one extra channel in the registry and the Realtime server stops pushing every unrelated audit row down the socket just to have it discarded on arrival. Mismatches are rare, so the channel is near-silent.
- `supabase/migrations/20260804223000_publish_audit_log_to_realtime.sql` — guarded and idempotent. Replica identity deliberately left at the default: both subscribers listen for INSERT only, and INSERT payloads carry the full new row regardless. `replica identity full` only matters for old-row data on UPDATE/DELETE, which `audit_log` forbids.
- Worth recording: `20260701120000_cso_signature_override.sql` already contained an `alter publication supabase_realtime add table public.audit_log`. It never took effect — the guard around it evidently no-opped, and the table was verifiably unpublished months later. The presence of a migration is not evidence that its effect landed.
- **The migration is intentionally NOT applied.** The debounce must be live in production first, or the currently-deployed dashboard begins refetching its whole aggregate once per audit row — exactly the failure mode the review warned about. Order: deploy frontend → apply migration → verify a mismatch surfaces without a refresh.

### 2026-08-04 — The service_role key and the CSO password are hardcoded in a tracked script, already pushed to GitHub

- **Why**: found by a pre-push secret scan, seconds before pushing. This is materially worse than the migration-history exposure recorded further down, and it changes the urgency of that entry's outstanding rotation from "schedule a window" to "do it now".
- `scripts/test-cso-endpoints.mjs` hardcoded three secrets as string literals: the project's **`service_role` JWT** (bypasses RLS entirely, `exp` 2036), the **CSO account password**, and the CSO's email. The CSO is the highest-privilege application role.
- **These are already on `origin/main`**, introduced in `0047369` and public since. The earlier scrub of `supabase_migrations.schema_migrations` removed one copy of the key; this is a second, more accessible copy that the scrub never touched. Anyone who has read the repository has had full RLS-bypassing database access and a working CSO login.
- The script now reads every value from the environment (`SUPABASE_PROJECT_REF`, `SUPABASE_SERVICE_ROLE_KEY`, `CSO_EMAIL`, `CSO_PASSWORD`) and exits 2 if any is missing. No literal remains.
- **Editing the file does not undo the exposure.** The values stay in git history at `0047369` and every commit after it. The only remediations that actually work are to invalidate the credentials themselves:
  1. Rotate the `service_role` key (or complete the migration to `sb_secret_...` keys and disable the legacy JWTs).
  2. Change the CSO account password.
  3. Optionally rewrite history (`git filter-repo` / BFG) — but that is cosmetic once 1 and 2 are done, and rewriting shared history has its own cost.
- Lesson worth keeping: the pre-push scan cost seconds and caught what a full day of security work had walked past. `scripts/` also sits outside the directories `CLAUDE.md` permits code in, which is part of why it escaped scrutiny.

### 2026-08-04 — Merge note: the report provenance badge now has more to show than it surfaces

- **Why**: the backend provenance work and the frontend badge were built in parallel on separate branches and met at this merge. Each was correct in isolation; together they leave one loose end worth naming rather than discovering later.
- The frontend entry below states that `ReportMetadata` "only ever carries `source: 'gemini' | 'template'`" and that `docs/AI.md`'s description of a `model` / `fallback_reason` shape "does not match the actual type". **That was true when it was written and is no longer true** — the backend entry further down added both fields, discriminated on `source`. `docs/AI.md` was describing the intended shape ahead of the type, and the type has now caught up.
- Practical consequence: `src/app/cso/reports/[id]/page.tsx` reads only `report.metadata?.source` (line 137). The badge correctly shows _that_ a report came from the template, but not **why** — `fallback_reason` distinguishes `no_api_key` (a deployment fault; regenerating will not help) from `sdk_error` (usually transient; regenerating probably will). That distinction is the actionable half for a CSO deciding whether to retry, and it is currently sitting in the database unread.
- Not a defect in either change, and deliberately not fixed here — widening the badge is frontend work and this merge should not quietly reach into it. Flagged for the frontend follow-up.

### 2026-08-04 — Migration fidelity audit: two more orphans found, 39 of 50 files verified byte-identical

- **Why**: the earlier backfill (entry below) recovered eight orphaned migrations, but "the directory now reproduces production" was still an assumption. The honest way to test it is to replay onto an empty database — which needs a Supabase branch, and branching is a Pro feature this org (free plan) does not have. A **free, read-only substitute**: compare every local file against the `statements` array of its matching `schema_migrations` row. That cannot prove a clean replay works, but it does prove whether the files match what was actually executed.
- **Method**: strip line comments, collapse whitespace, lowercase, hash. Same normalisation on both sides — in SQL for the remote text, in Node for the local files — so the comparison is of SQL substance, not formatting. Result: **54 local files, 50 remote rows, 39 identical, 11 differing, 6 local-only, 2 remote-only.**
- **Two more orphans, missed by the first pass.** The earlier backfill matched local files to remote rows by name and never enumerated the remote-only remainder, so it found 8 of 10. Recovered now:
  - `20260612101921_enable_pg_cron_pg_net` — the `create extension` calls every later cron migration depends on.
  - `20260627112910_fix_nominate_collector_unit_id` — the hotfix applied an hour after the `departments` → `units` rename, because the version of `nominate_collector_active_check` that actually ran still referenced the old column names. Committed for **history fidelity, not as a functional rescue**: the local copy of `20260627111250_nominate_collector_active_check.sql` was corrected in place at some point and already uses `unit_id`, so replaying the local directory produces a working function with or without this file. Re-running it is a no-op (`create or replace`, same final definition). Confirmed against production: the live function uses `k.unit_id` and joins `public.units`, matching the recovered file exactly.
  - This also explains one of the 11 content differences below: `nominate_collector_active_check` is 24 characters shorter locally than the stored statement, because the local copy is the post-rename version and the stored one is the pre-rename version that genuinely executed.
- **The 11 content differences are not all equal.** Two were run down in full:
  - `expire_lapsed_codes` (1 char): the stored statement schedules the cron every 5 minutes, the local file every 10. The **live job is `*/10`** — so the file is ahead of the recorded statement, not behind. Benign; the statement is stale bookkeeping.
  - `weekend_code_expiry_rollback` (same length, different hash): five `errcode` literals. The local file raises `P0007`/`P0010`/`P0015`; **production raises `P0001` for all five**. The local file was edited after being applied and the edit never shipped. It is behaviourally inert — every route maps RPC failures on the message text (`msg.includes('NOT_EXPIRED')`), never the SQLSTATE — but it is a real fidelity gap, and it would stop being inert the moment anyone switched to matching on error codes.
  - The remaining nine were measured but not individually diffed. Most sit in `create or replace function` bodies that later migrations replace outright, so they likely wash out — that is a plausible expectation, not a verified one.
- **What this does and does not establish.** It establishes that the recovered files are faithful and that two more were missing. It does **not** establish that replaying the directory from empty produces production's schema — ordering, dependency and drop/recreate effects are invisible to a per-file text comparison. The replay is still required; on a free plan the cheapest path is `supabase start && supabase db reset` locally, or a second free project ($0/month), not a Pro branch.

### 2026-08-04 — Eight applied migrations existed only in the database; recovered into version control

- **Why**: acting on review item 1 ("reconcile the migration history"), the first step was measuring the actual divergence rather than trusting the review's summary. The review said `schema_migrations` recorded "~6 of 43" local files. Measured against the live project: **46 local files, 50 remote rows, 8 matching by version**. The real problem was not the count — it was what the mismatch was hiding.
- **Two distinct problems.** (a) _Version drift_, 32 files: local files are hand-numbered (`20260525000001_…`) while `schema_migrations` records the true applied timestamp (`20260525133356`) under the same name. Same SQL, same order, different version string — this is what makes the CLI treat every local file as unapplied. Cosmetic. (b) _Eight migrations applied to production but never committed_, ~30 KB of SQL living only in `schema_migrations.statements`: `authoriser_aware_rpcs` (11.9 KB), `security_performance_fixes` (7.5 KB), `faculties_and_admin_authoriser` (4.7 KB), `storage_rls_policies`, `edge_function_schedules_with_values`, `merge_profiles_update_policies`, `revoke_anon_execute_on_all_functions`, `create_storage_buckets`.
- **The consequence of (b)**: a fresh replay of `supabase/migrations/` does not reproduce production. Repairing the history table first — the review's actual recommendation — would have marked those versions applied and guaranteed nobody ever looked again, cementing the loss.
- All eight recovered verbatim from `schema_migrations.statements` into real migration files, each carrying a header recording that it was backfilled and why. Ordering is preserved by using the true applied version as the filename.
- **One deliberate deviation from verbatim**: `edge_function_schedules_with_values` inlined the project's live `service_role` JWT as a literal, twice. That key bypasses RLS entirely, so it is committed as `<REDACTED_SERVICE_ROLE_JWT>` rather than checked into git. The deviation is documented in the file itself. See the security entry below.
- Verified separately that all six local files with no remote row **are** applied in production (storage buckets, `requests` replica identity, realtime publication entries, the `departments` → `units` rename, `approve_weekend` carrying `p_cso_override`) — they need recording, not re-running.
- **Still outstanding**: the version reconciliation itself. Before it can be trusted, the directory must be replayed onto an empty database (a Supabase branch) and diffed against production. Until that passes, "reconciled" is a claim, not a fact. The standing prohibition on `supabase db push` / `npm run db:migrate` remains in force.

### 2026-08-04 — The service_role key is stored in plaintext in the migration history table

- **Why**: found while recovering the orphaned migrations above. `edge_function_schedules_with_values` was executed with the live `service_role` JWT inlined as a string literal, so it is now sitting in `supabase_migrations.schema_migrations.statements`, readable by anyone with superuser or dashboard access to the project. It was one `git add` away from being committed to the repository.
- **Not an active exposure**: `20260622140052_cron_jobs_direct_sql.sql` later replaced the `http_post`-based cron jobs with direct SQL calls, so no live `cron.job` command carries the key — confirmed, 0 of 5 jobs. All five jobs are active and on their expected schedules.
- **Scrubbed** (2026-08-04). The stored statement was rewritten in place, replacing both JWT occurrences with `<REDACTED_SERVICE_ROLE_JWT>` — the same placeholder the committed file carries. `statements` is CLI bookkeeping for an already-applied migration, so nothing in the schema changed: 50 rows before and after, the row's single statement preserved, all 5 cron jobs untouched. Verified afterwards that **no** row in the migration history contains a JWT.
- Detection note for anyone repeating this: grepping the statements for `service_role` finds **nothing**. The role lives in the JWT's base64 payload, not in plaintext — match the `eyJ` JWS header instead. Decoding only the `role`/`exp`/`ref` claims (never the token) confirmed it as this project's `service_role` key with an expiry of **2036-05-24**, i.e. a decade of validity had it leaked.
- **Still outstanding — rotation.** Scrubbing removes the copy; it does not un-expose a key that sat readable in the project for two months. Rotating is a dashboard action with real blast radius (every environment holding `SUPABASE_SERVICE_ROLE_KEY` — Vercel prod/preview/dev, any local `.env.local` — must be updated in the same window or server-side routes start failing). Left for a deliberate maintenance slot.
- Reinforces the existing rule in `CLAUDE.md`: the service-role key is server-only. Worth extending that to "and never as a literal in SQL that gets executed" — `pg_cron` jobs should read secrets from Supabase Vault, which is what `weekend-code-reminders` already does.

### 2026-08-04 — audit_log is not published to Realtime, so the CSO signature-mismatch alert is dead

- **Why**: review item 10 assumed `audit_log` was unpublished and recommended filtering before adding it. Checking the live publication confirmed the premise and turned up a live bug behind it. Published tables are `authorisations`, `incidents`, `keys`, `requests`, `shifts` — `audit_log` is absent, despite `20260701120000_cso_signature_override.sql` containing an `alter publication … add table public.audit_log` guarded by a `DO` block that evidently no-opped.
- **Consequence**: two CSO dashboard components subscribe to `audit_log` and therefore never fire. `events-chart.tsx:141` never updates live. `signature-mismatch-alerts.tsx:50` — which filters for `SIGNATURE_MISMATCH` — never fires at all, so the signature-tampering alert surface is silently dead. `docs/AI.md` states a mismatch "raises a CSO alert"; the audit entry is written and the approval is correctly held, but the dashboard never learns of it. The alert is discoverable only by polling `GET /api/ai/signature-alerts` on page load.
- **Refines the fix**: `signature-mismatch-alerts` already filters client-side in its callback, so it can move to a server-side `event=eq.SIGNATURE_MISMATCH` filter. `events-chart` genuinely needs every row for its counts, so it needs debouncing, not filtering. The frontend change should land before the table is published, or the CSO dashboard will refetch on every audit write.
- Not fixed here — recorded in `docs/REVIEW_ACTIONS_BACKEND.md` and `docs/REVIEW_ACTIONS_FRONTEND.md` with the corrected framing.

### 2026-08-04 — pgTAP suite for the RPCs and RLS policies that enforce business rules

- **Why**: review item 2. RPCs and RLS policies had zero automated coverage — no `supabase/tests/` directory, no `test:db` script. Two of the five critical findings in the review were failures this layer would have caught.
- Four suites added under `supabase/tests/`, in the review's priority order: `01_authorisation_slots_test.sql` (max-3-collectors trigger, `nominate_collector`, slot reuse after `remove_collector`), `02_weekend_expiry_test.sql`, `03_audit_log_immutability_test.sql`, `04_authoriser_gate_test.sql` (Dean-vs-CSO on `approve_weekend` / `decline_weekend` / `nominate_collector` / `dismiss_expired_request`).
- `02_weekend_expiry_test.sql` encodes the exact failure from 2026-08-02: a past-dated guest request with a null `key_id` must expire cleanly **and** must not prevent other rows in the same batch from expiring. That second assertion is the one that matters — the original outage was one un-expirable row aborting the whole transaction.
- `test:db` script added to `package.json`. **The suite has not been executed** — there is no Docker in this environment, so no local Supabase stack to run pgTAP against. The tests are written against the live schema (verified via read-only queries) but are unproven until someone runs them. Not yet wired into CI for the same reason.

### 2026-08-04 — Shift reports now record whether Gemini or the template produced them

- **Why**: template-fallback and Gemini reports rendered identically apart from prose quality, so a CSO had no way to know they were reading a degraded report, and no signal that regenerating later might give them a better one.
- The frontend was **already built for this**: `src/app/cso/reports/[id]/page.tsx` reads `report.metadata?.source` in two places (the `isTemplate` prop, and appending "(template fallback)" to the AI disclosure). The backend never wrote `source`, so it was permanently `undefined` and both branches were permanently false. This change makes existing dead UI live rather than adding a feature.
- `metadata` is `jsonb`, so the addition is purely additive — no migration. `ReportMetadata` is now discriminated on `source`: the `gemini` branch always carries the `model` actually used, the `template` branch always carries a `fallback_reason` of `no_api_key` / `sdk_error` / `unparseable_output`. That three-way split is the useful part — `no_api_key` means regenerating will not help and a deployment is misconfigured, whereas `sdk_error` invites a retry.
- Two incidental fixes: `GEMINI_MODEL` now resolves per call rather than at module load, so a report records the model in force at generation time; and it uses `||` rather than `??`, so an empty-string env var (trivial to set by accident in a platform dashboard) falls back to the default instead of sending `model: ''` to the SDK.
- 8 new tests in `src/lib/ai/reports/client.test.ts`, including one asserting the counts are byte-identical across all four paths — provenance must never perturb the numbers.

### 2026-08-04 — Post-deploy smoke test, changelog CI check, dead route removed, signature fixtures pinned

- **Why**: the remaining review items — 8 (post-deploy smoke test), 12 (retire the duplicate route), 3 (protect the signature fixtures), plus the §12 changelog-discipline check.
- `tests/smoke/smoke.mjs` — zero-dependency Node script, 12 checks, run by `.github/workflows/post-deploy-smoke.yml` on successful `deployment_status`. **It does not mutate production**: `collect` and `keys/return` check role before parsing the body (verified — `getUser` and the role gate both precede `request.json()` in all three routes), so anonymous → 401 and requester-session → 403 proves the route is deployed, reachable, namespace-resolving and role-gated without issuing a real key or writing audit rows on every deploy. MFA is handled by completing the REQUESTER login (the only MFA-exempt role) and asserting only the _shape_ of the CSO response — a test-only MFA bypass in production code would be a permanent hole in exchange for a test.
- Its most valuable check is not in the review: `GET /api/requests/my` **without** a `Referer` must return 401. That is the cookie-namespace trap documented in `docs/postman/README.md` as "the one thing that will waste your afternoon", now pinned by a test rather than a paragraph.
- `.github/workflows/changelog.yml` — PR check that a change touching anything outside `docs/` also touches `docs/CHANGELOG.md`, with a `skip-changelog` label as a deliberate escape hatch. Enforces the rule in `CLAUDE.md` that was added on 2026-08-02 after a fix shipped without an entry.
- `GET /api/admin/departments` deleted. Proved unreferenced first: every consumer already calls `/api/admin/units`, and the two handlers were byte-identical apart from the response key. The "List units (legacy alias)" request was removed from `docs/postman/SmartKey.postman_collection.json`, from the **live Postman collection** (`SmartKey API`, via MCP — the exported JSON and the hosted collection are both current), and its gotcha note from `docs/postman/README.md`. The collection no longer documents a route that 404s.
- `src/lib/ai/signature/verifier.test.ts` gained a `FIXTURE CONTRACT` comment and 7 tests asserting fixture ink coverage stays in the 0.2–5% band real signatures occupy. The 9 existing tests are untouched. This makes the fixture property an enforced invariant rather than an unstated assumption — the 2026-08-02 bug survived precisely because block fixtures at 10–50% coverage made a denominator error invisible. Verified to have teeth by mutation-testing: swapping a stroke for a solid block fails 6 of the 7 new tests and takes the forgery regression guard down with it.

### 2026-08-04 — Four small frontend hardening items: error boundaries, report provenance badge, tri-browser E2E, design lint script

- **Why**: follow-up from an examiner-style review comparing the implementation against the original project report. The review's highest-priority frontend findings were: no `error.tsx`/`global-error.tsx` anywhere in `src/app` (the 2026-08-02 verifier-handover crash hit exactly this gap — a render throw produced a blank page instead of a recoverable card), the shift-report detail page only distinguished Gemini-generated vs. template-fallback reports via plain italic text rather than a proper status indicator, `playwright.config.ts` only ever defined `chromium`/`mobile` projects despite the report specifying tri-browser E2E, and `CLAUDE.md` already flagged the missing `design:lint` script as a manual-step footgun.
- `src/app/error.tsx` — segment-level error boundary. Logs via `logger.error` (never `console.log`), renders the exact `DESIGN.md` error copy pattern ("Something went wrong" + "Error reference: {id} — share this with the CSO if you contact support", using `error.digest` as the reference), with "Try again" (`reset()`) and "Get help" (links to `/help`) actions. Stack traces/`error.message` are logged server-side only, never shown.
- `src/app/global-error.tsx` — catches errors in the root layout itself. Per the Next.js contract this replaces the whole document, so it renders its own `<html>`/`<body>` and cannot depend on `ThemeProvider` or the font variables the root layout normally provides; styled with inline styles rather than design tokens for that reason, not as a departure from the no-hardcoded-hex rule elsewhere.
- `src/app/cso/reports/[id]/page.tsx` — the `metadata.source === 'template'` suffix text is now a `Badge` (existing shadcn primitive) with an icon and `aria-label`, following the same status-colour-plus-icon-plus-text convention as `RiskTierBadge`. Confirmed while doing this that `ReportMetadata` (`src/lib/ai/reports/types.ts`) only ever carries `source: 'gemini' | 'template'` — `docs/AI.md`'s description of an additional `model`/`fallback_reason` provenance shape does not match the actual type, so the badge surfaces only what genuinely exists. The required "Generated by AI from shift event data" disclosure sentence is unchanged.
- `playwright.config.ts` — added `firefox` (`Desktop Firefox`) and `webkit` (`Desktop Safari`) projects alongside the existing `chromium`/`mobile` ones. CI (`e2e.yml`) still runs `--project=chromium` only for now — expanding the CI matrix to all four projects triples E2E run time across the 16 specs and was left as a deliberate follow-up decision, not bundled into this change. Requires a one-time local `npx playwright install firefox webkit` to actually run them.
- `package.json` — added `"design:lint": "npx @google/design.md lint design-system/DESIGN.md"`, matching the command `design-system/prompts/README.md` already documented as a manual step.
- `.gitignore` — added `docs/SmartKey_Examiner_Review.pdf`: a generated review artifact, not project documentation, so it shouldn't be tracked.

### 2026-08-02 — OTP inputs now clear their deferred test timers before teardown

- **Why**: the verifier return-key test run was passing all assertions but still ended with an unhandled `ReferenceError: window is not defined` from `input-otp` after Vitest tore the DOM down. The library schedules deferred selection-sync callbacks with `setTimeout` and does not clear them on unmount, so the callbacks could fire after the test environment was gone.
- Added a SmartKey wrapper around the OTP primitive that, in `NODE_ENV=test`, temporarily patches `setTimeout`/`clearTimeout` for the mounted tree and clears every tracked timer on cleanup. That keeps the library behaviour unchanged in the app while preventing post-teardown callbacks in tests.
- Repointed the login, verifier return-key, and verifier live-queue forms to the wrapper so they all share the same safe OTP behaviour.

### 2026-08-02 — Lapsed weekend requests can be dismissed; the auto-expiry cron had been failing silently for weeks

- **Why**: the Dean/CSO weekend queue showed expired requests indefinitely with an "Expired" badge and both decision buttons permanently disabled — a dead row that could never be cleared. The obvious reading was a missing feature, but `expire_stale_weekend_requests()` already existed and was scheduled nightly to clear exactly these. Checking `cron.job_run_details` showed it had **failed on every single run** since at least 26 July.
- **Root cause**: `requests_key_required_after_pending` allowed a null `key_id` only in `PENDING_HOD`/`DECLINED`. A guest weekend request has no key until the Dean assigns one at approval, so a never-approved guest row could not move to `EXPIRED` without violating the constraint. Because the RPC expires rows in one transaction, that single un-expirable row aborted the whole batch — **no** stale request expired, and the queues accumulated dead rows. Same bug class as `20260616120547_fix_guest_decline_constraint.sql`, which had widened the constraint for `DECLINED` and stopped one state short.
- `20260802223014_widen_requests_key_required_for_terminal_states.sql` widens it to `PENDING_HOD` / `DECLINED` / `EXPIRED` / `CANCELLED` — the terminal states reachable before a key is ever assigned. Every other status still requires a key. Running the RPC manually afterwards cleared the backlog: 12 rows (4 `PENDING_HOD`, 8 `APPROVED`, oldest 28 June).
- `20260802223104_dismiss_expired_request_rpc.sql` adds `dismiss_expired_request(request_id, actor_id)` so an authoriser need not wait for the 00:15 sweep. Accepts only `PENDING_HOD`/`APPROVED`/`CODE_ISSUED` weekend requests whose `requested_for` has passed; moves them to `EXPIRED` with a `REQUEST_EXPIRED` audit entry carrying `reason: 'dismissed_by_authoriser'`, the previous status, and the actor. No `hod_decisions` row — this is housekeeping, not a decision on merits. Authoriser gate mirrors `decline_weekend` (Dean → own faculty; CSO → any). Verified live: requester → FORBIDDEN, other-faculty Dean → FORBIDDEN, owning Dean → `EXPIRED` + audit entry.
- New `POST /api/requests/dismiss` (DEAN, CSO). Dismiss buttons added to the expired rows and detail sheets of both `dean/weekend-requests` and `cso/weekend-requests`; the sheet swaps the two permanently-disabled decision buttons for a single working action. Dismissed requests stay `EXPIRED`, so they remain in requester history and the CSO audit log — dismissing hides them from the queue, it does not erase them.
- Both migrations were applied via the Supabase MCP `apply_migration` tool (recorded remotely as `20260802223014` / `20260802223104`), **not** `npm run db:migrate` — see the migration-history entry below for why `db push` must not be run on this project.

### 2026-08-02 — Signature verification was passing every forgery; scoring moved to the ink region

- **Why**: asked whether the Dean signature/stamp check had ever been tested on real images. It had not — the four unit tests compared solid rectangular blocks covering 10–50% of the canvas. Running the real pipeline against signature-shaped strokes showed the feature never rejected anything.
- **The bug**: `mismatch_ratio` divided the differing-pixel count by the whole canvas (320,000 px). Signature strokes cover ~1.6% of an 800×400 page, so no two signatures can differ by more than ~3.3% of it — the 15% threshold was mathematically unreachable. Measured: a completely different signature scored **3.23%** and a blank page **1.80%**, both `passed: true`. The block-based tests passed because they reached coverage no signature ever does.
- **The fix**: `verifySignature` now crops both images to their ink bounding box (`sharp.trim()`) before resizing, which registers them against each other, then scores differing pixels ÷ pixels carrying ink in _either_ image (a Jaccard distance over the ink region). Registration is essential, not cosmetic: without it a genuine re-scan offset by 20px scores ~97%, worse than an outright forgery, because thin strokes lose all overlap under a small translation. A blank reference or blank submission short-circuits to a total mismatch rather than passing.
- Measured separation after the fix — identical 0%, re-positioned 0%, 0.85× scale 11%, heavier pen 31%, different signature 100%, blank page 100%. Default threshold moved **0.15 → 0.55**, which sits in that gap.
- **Deployment note**: any environment still setting `SIGNATURE_DIFF_THRESHOLD=0.15` must be updated. Under ink-region scoring that value rejects nearly every genuine signature and would hold every Dean approval. The two call sites that had their own hardcoded `?? '0.15'` fallback (`hod-decision`, `profile/signature`) now import `DEFAULT_THRESHOLD` so there is one source of truth.
- Tests rewritten: 9 cases over rendered stroke fixtures with realistic ink coverage, including the regression guard (different signature must fail) that the old suite structurally could not express. Still calibrate against real Dean samples during the pilot — treat a pass as "not obviously tampered", never as proof of authorship.

### 2026-08-02 — Login no longer fails when the OTP email cannot be sent

- **Why**: local `npm run dev` showed `POST /api/auth/login 500 in 23.4s`, with `OTP email failed … ENETUNREACH 2a00:1450:4009:c0f::6d:587` then `ETIMEDOUT 192.178.223.108:587`. Credentials were accepted and the MFA code hash was already persisted, but the route returned 500 and the user could not proceed — a mail outage locked out every MFA role, and the Postman collection's `login → verify-otp` chain was unusable.
- Three separate faults: the transporter had **no timeouts**, so a filtered port 587 hung on the OS TCP timeout (~20s, longer than the Vercel function budget); Node 18+ resolves `smtp.gmail.com` AAAA-first, so a network with no IPv6 route failed with `ENETUNREACH` before the A record was tried; and the raw error string was echoed into the response body, contradicting `docs/API.md`'s rule that internal detail never appears in responses.
- `src/lib/email/otp.ts`: added `connectionTimeout`/`greetingTimeout`/`socketTimeout`/`dnsTimeout`, and `dns.setDefaultResultOrder('ipv4first')` — nodemailer has no per-transport `family` option, so resolver order is the available lever.
- `POST /api/auth/login` no longer 500s on a send failure. It returns 200 with `mfa_required: true` and a new `email_delivery_failed: true` flag, logging the detail server-side only. The stored code hash is untouched, so a subsequent `/api/auth/resend-otp` delivers a valid code — the failure is recoverable in-flow instead of a dead end. The OTP screen surfaces a warning and skips the 60-second resend cooldown when the first send failed.

### 2026-08-02 — `middleware.ts` renamed to `proxy.ts` (Next.js 16 file convention)

- **Why**: Next.js 16 deprecated the `middleware.ts` file convention in favour of `proxy.ts` — same request/response API, but the file and exported function are renamed to avoid confusion with Express-style middleware. Every `next build`/`next dev` run was printing a deprecation warning.
- Migrated with the official codemod (`npx @next/codemod@canary middleware-to-proxy .`): `src/middleware.ts` → `src/proxy.ts`, `export const middleware` → `export const proxy`. No other change — same `PROTECTED_ROUTES`, `config.matcher`, and role-gating logic. `src/lib/supabase/middleware.ts` (the `updateSession()` helper) is unaffected; it's a differently-purposed file that happens to share the word "middleware."
- `docs/ARCHITECTURE.md` updated to reference `proxy.ts`. Verified with `npm run typecheck` and `npm run lint` (both clean); a full `npm run build` in this environment hit an unrelated Google Fonts network fetch failure, not connected to this change.

### 2026-08-02 — CSO "Risk rules" settings screen wired to the real risk engine

- **Why**: the `/cso/settings` "Risk rules" screen (rule weights, enable toggles, tier thresholds) was a pure UI mockup — inputs used `defaultValue`/`defaultChecked` with no state, the Save button had no handler, and nothing was ever persisted. The actual risk engine (`src/lib/ai/risk/`) always ran with hardcoded weights and env-var-only tier thresholds; there was no way for a CSO to change scoring behaviour without a code deploy, despite `docs/BACKEND.md`/`docs/AI.md` describing this as CSO-configurable.
- Added two tables — `risk_rule_config` (one row per rule, `CHECK (weight BETWEEN 1 AND 10)`) and `risk_tier_config` (singleton, `CHECK (high_min > medium_min)`) — rather than a JSONB blob, so invalid values are rejected at the DB level. RLS: `SELECT` for `authenticated` (the engine reads its own config inside a REQUESTER's session at submit time); no write policy for any role — writes only go through the new `update_risk_config` RPC (CSO-gated, one audit entry per save via `_write_audit`, not one per rule).
- `supabase/migrations/20260802140000_add_risk_config_tables.sql` — applied directly to the live project via the Supabase MCP `apply_migration` tool (recorded remotely as version `20260802222801`, per the timestamp-drift pattern documented in the entry below — this is expected, not a new problem). **Not** applied via `npm run db:migrate` / `supabase db push`, per that same entry's warning that the migration history is unreconciled and `db push` would attempt to replay the entire history from scratch.
- `evaluateRisk(context, config)` now takes a required second `RiskEngineConfig` argument — skips disabled rules entirely (they never appear in `risk_factors`) and threads per-rule weight and the tier boundaries from the config instead of reading `getTierConfig()` internally. `DEFAULT_RISK_CONFIG` (`src/lib/ai/risk/default-config.ts`) is both the engine.test.ts fixture and the runtime fallback `POST /api/requests/submit` uses if the config read fails — a transient DB hiccup degrades to the safe hardcoded defaults rather than 500ing a key request.
- New `GET`/`PATCH /api/admin/risk-rules` (CSO-only) backs the settings screen; `risk-rules-settings.tsx` is now a real `'use client'` component (fetch on mount, edit, save, persistent confirmation card per `design-system/DESIGN.md` — not a toast) and fixes the mockup's rule-id mismatch (`outside_hours` etc.) to use the canonical `rule_key` strings the engine actually returns.
- New audit event `RISK_CONFIG_UPDATED` (mapped to the `SETTINGS` category in the CSO audit UI).
- Docs updated: `docs/DATABASE.md` (new tables + RPC), `docs/API.md` (new routes + RPC cross-reference), `docs/AI.md` (corrected the risk-scoring section's config claims — this was previously false).

### 2026-08-02 — Migration history has diverged from the repo; duplicate weekend-RPC overloads dropped

- **Why**: while verifying the realtime publication (entry below) the live table list came back with `audit_log` missing despite a migration that adds it, and with `incidents` and `shifts` present despite no migration adding either. Pulling that thread exposed a far larger problem than the realtime gap, plus an active bug in the Dean approval path.
- **The divergence**: of 43 local files in `supabase/migrations/`, only **6** are recorded in `supabase_migrations.schema_migrations`; **22** recorded versions have no matching local file. The same schema content was applied under different version strings than the repo filenames carry — the remote's are real timestamps (`20260613071010`), the repo's are hand-authored (`20260613000002`). **The migrations directory is therefore not a reliable record of this database.** This retro-explains every schema anomaly found this week: the `units.authoriser` column and `department_authoriser` enum that exist live with no migration creating them, `incidents`/`shifts` being published out of band, and `audit_log` not being published despite a migration that does so.
- **`supabase db push` / `npm run db:migrate` must not be run on this project** until the history is reconciled (e.g. `supabase migration repair`). It would see 37 "unapplied" migrations and begin with `20260525000001`–`20260525000009`, the original `CREATE TYPE` / `CREATE TABLE` files, against a database where all of it already exists — hard failures and possible partial application. Schema changes are applied as targeted SQL in `supabase/scripts/` instead, with a matching migration committed purely as the record for fresh environments.
- **The active bug**: `20260701120000_cso_signature_override.sql` never ran, so its `drop function if exists` statements never executed. `20260705120000` then created the current signatures _alongside_ the stale ones left by the units rename, leaving four functions live: `approve_weekend` in both 5-arg and 6-arg forms, `decline_weekend` in both 3-arg and 4-arg forms.
- `src/app/api/requests/hod-decision/route.ts` calls `approve_weekend` with exactly five named params at lines 348 and 382 — the Dean's normal approval paths, signature-verified and no-letter. Both overloads matched that call, so either PostgREST failed to disambiguate (`PGRST203`, approval errors) or it picked the exact 5-param match and silently ran the **stale** function — which lacks the past-date guard added by `20260705120000`, meaning Deans could approve weekend requests for dates already passed, quietly defeating commit `97a8d7f`. Which of the two was happening was not determined; the fix resolves both.
- Fixed by `supabase/scripts/fix-duplicate-weekend-rpc-overloads.sql`, run against the live project on 2026-08-02. Drops only the two stale signatures (fully qualified, so the current ones are untouched). Verified afterwards: exactly one `approve_weekend` remains and it contains the `requested_for` past-date guard. The five-param call now resolves uniquely with `p_cso_override` defaulting to false, which is the intended Dean-approval behaviour.
- No application code changed — the route was always calling the right thing; the database had two answers to the same name.

### 2026-08-02 — Realtime audit: `authorisations` was never published; changelog now mandatory on every push

- **Why (realtime)**: a sweep to confirm Supabase Realtime is genuinely live rather than merely wired up. Three of the four subscribed tables check out; one did not, and its failure mode is silent — the channel joins, reports `SUBSCRIBED`, and simply never receives an event, so nothing in the UI or logs indicates a problem.
- **Verified working**: `requests` (13 subscribers) and `keys` (2) are both in the `supabase_realtime` publication with `REPLICA IDENTITY FULL`.
- **Correction (same day, from live inspection)**: this entry originally claimed `audit_log` was published too. It is not — that was read off the migration rather than the database. The block that publishes it sits in `20260701120000`, which never ran (see the entry above). So the CSO dashboard's `signature-mismatch-alerts` and `events-chart` subscriptions receive nothing. Left unpublished pending a decision: `events-chart.tsx` invalidates its query on _every_ `audit_log` INSERT with no filtering, and that table gets a row for essentially every consequential action, so re-publishing it as-is would make the CSO dashboard refetch on every key issue, return, login and approval.
- **Broken**: `authorisations` is subscribed by the Dean dashboard's collectors table but was **never added to the publication**. A collector added or removed elsewhere left that widget stale until a manual reload. Fixed by `supabase/migrations/20260802103000_authorisations_add_to_realtime_publication.sql` (idempotent, guarded on `pg_publication_tables`, matching `20260613000004`). Replica identity deliberately left at default: every handler on that subscription just calls `queryClient.invalidateQueries` and ignores the payload, so the PK-only `old_record` sent on DELETE is sufficient.
- **Applied** to the live project on 2026-08-02 via `supabase/scripts/apply-authorisations-realtime.sql` in the SQL editor, not `db:migrate` — see the migration-history entry above for why `db push` must not be used on this project. Verified: the publication now contains `authorisations`, `incidents`, `keys`, `requests`, `shifts`, with `requests`/`keys` on `REPLICA IDENTITY FULL` and the rest on default.
- The client-side hook (`src/hooks/use-realtime.ts`) is sound and needs no change: a module-level registry multiplexes every subscriber for a given table + filter onto one channel with ref-counted teardown, so the 22 subscribing components open ~4 websocket channels rather than 22, and `supabase.realtime.setAuth()` is called _before_ the channel is created (a channel that joins first authenticates as `anon`, and the Realtime server does not retroactively start delivering `postgres_changes` after a later `setAuth` — the RLS check is fixed at join time). No component bypasses the hook with a direct `.channel()` call.
- **Why (changelog rule)**: the verifier fix below was pushed without a changelog entry, which is how the file previously drifted five weeks behind. `CLAUDE.md`'s workflow rules now require a `docs/CHANGELOG.md` entry on **every** push — fixes, refactors, docs and config included — not only for database changes as before.

### 2026-08-02 — Verifier handover page crashed on an RLS-nulled officer join

- **Why**: `/verifier/handover` failed to render in production with the bare "This page couldn't load" error. `GET /api/shifts/current` embedded the officer via `primary_officer:profiles!primary_officer_id(...)` using the **session** client, but the `profiles_select` RLS policy grants read on own row, all rows for CSO, and own-unit rows for a Dean — there is no VERIFIER clause. PostgREST silently returns `null` for an RLS-blocked embed rather than erroring, and `handover-view.tsx` typed `primary_officer` as non-nullable and dereferenced it bare, throwing a TypeError during render.
- The failure was guaranteed in the exact scenario the screen exists for: viewing your own shift returned your own readable profile row and worked fine, so it only broke when the shift belonged to a _different_ officer — i.e. every real handover.
- Same class of bug as the 2026-06-16 `guest_requesters` entry below (an RLS-filtered embed silently nulling a join), now on `profiles`.
- `src/app/api/shifts/current/route.ts`: the shift query now uses `createAdminClient()`, mirroring the established pattern and comment in `src/app/api/keys/out/route.ts`. Auth and the role gate still run on the session client first; only the join is elevated.
- `src/app/verifier/handover/_components/handover-view.tsx`: `primary_officer` typed `| null` (matching how the CSO report views already model the same join) and rendered with `?? 'Officer unavailable'`, so a null can never blank the page again regardless of what the API returns.
- Checked the sibling verifier components — `outstanding-keys.tsx` and `live-request-queue.tsx` already guard their joined-profile reads; this was the only unguarded dereference.
- Noted, not fixed: there is no `error.tsx` or `global-error.tsx` anywhere in `src/app` (only `not-found.tsx`), which is why a single render throw produced a blank page rather than the recoverable error card `docs/SCREEN_CHECKLIST.md` specifies.

### 2026-08-02 — Postman collection for the whole API surface

- **Why**: `docs/API.md` is a spec-level reference — it says what each route expects, but gives a frontend dev no way to actually exercise one. The blocker is not documentation volume, it is that SmartKey's auth is close to un-guessable from outside: sessions live in **role-namespaced cookies**, and for `/api/*` paths the namespace is resolved _only_ from the `Referer` header. Call any authenticated route from Postman or curl without one and you get a 401 while being genuinely signed in. From a browser it never surfaces (`fetch` sets `Referer` from the current page), so nothing in the app hits it and nothing documented it.
- `docs/postman/SmartKey.postman_collection.json` — 65 requests covering all 58 unique method + path combinations, in 9 folders grouped by calling role (Auth, Requester, Dean, Verifier, CSO oversight, CSO administration, Profile, Public/guest, System). Every authenticated request carries the correct `Referer`; test scripts auto-capture `requestId` / `keyId` / `unitId` / `shiftId` / `reportId` / `guestToken` / codes into collection variables so a full flow runs without hand-copying UUIDs.
- `docs/postman/SmartKey.postman_environment.json` — `baseUrl` plus credential placeholders. Every secret-typed value ships **empty**; they are filled in locally and must never be committed back.
- `docs/postman/README.md` — import steps, the per-role `Referer` table, the two-step MFA flow (CSO/Dean/Verifier; REQUESTER is the only role exempt), which request to run first to populate each variable, a full weekday issue-and-return walkthrough, and curl equivalents for non-Postman users.
- Coverage was verified mechanically rather than by eye: extracting `METHOD /path` from the collection and from `src/app/api/**/route.ts` and diffing gives 58 = 58 with zero drift in either direction. The README documents that command so the check is repeatable when routes change.
- The collection also pins down several behaviours whose route names actively mislead, all confirmed against the handlers: `hod-decision` returns `APPROVED`/`DECLINED` and never `CODE_ISSUED` (no code exists at decision time); a held signature mismatch is **HTTP 200** with `status: 'HELD_SIGNATURE_MISMATCH'`, since a held approval is a business outcome and not a transport error; there is no `PENDING_CSO` status, so `cso-queue` is a review surface over already-issuable requests and `cso-decision` with `APPROVED` changes no state at all; `GET /api/admin/users` takes no query params and does not paginate; `POST /api/requests/collect` ignores any client-supplied `verifier_id` and uses the session; `register` / `activate-hod` have no `token` field and are not runnable from Postman without the browser callback step; `/api/admin/departments` is a pre-rename duplicate of `/api/admin/units` differing only in the response key.
- Hand-maintained alongside `docs/API.md` — a route change needs both updated.

### 2026-08-02 — Register/activate-hod: enforce the real password policy

- **Why**: `POST /api/auth/register` and `POST /api/auth/activate-hod` each hand-rolled `password.length < 8` with no composition check, while `POST /api/auth/change-password` and the activate-hod client form already used the shared `password` zod primitive (`src/lib/validation/primitives.ts`, min 8 + upper/lower/digit/symbol) — found while reconciling `docs/API.md` against the actual code, which showed the min-8 rule was weaker than the min-12/mixed/symbol policy stated in `screens.md` §5.1, `PRODUCT.md`, and `supabase/config.toml`'s `minimum_password_length`/`password_requirements`.
- `src/lib/validation/primitives.ts`: `password`'s `.min(8, ...)` bumped to `.min(12, ...)` to match the stated policy. This also strengthens `change-password` and `reset-password` for free, since both already import the same primitive.
- `src/app/api/auth/register/route.ts` and `src/app/api/auth/activate-hod/route.ts`: replaced the ad-hoc length check with `passwordSchema.safeParse(formData.get('password'))`, returning the specific validation failure message (422) instead of a generic length error.
- `docs/API.md`: the two routes' documented password rule updated from "min 8" to "min 12, mixed case, number, symbol" to match.

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
