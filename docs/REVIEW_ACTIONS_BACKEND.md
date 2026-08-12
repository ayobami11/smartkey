# Review actions — Backend

Backend-owned items from the 2026-08-04 system review. Status as of 2026-08-12.

Frontend items (4, 5, 6, 9, 13, 14, and two §12 improvements) were split into a companion
`REVIEW_ACTIONS_FRONTEND.md`, which is **not in the repo** — needs recreating from the
original review document.

---

## Status

| #   | Item                                | Priority | Status                                           |
| --- | ----------------------------------- | -------- | ------------------------------------------------ |
| 1   | Reconcile the migration history     | Critical | ✅ Done (2026-08-07)                             |
| 2   | pgTAP tests for RPCs and RLS        | Critical | ✅ Done, 75 tests, wired into CI (2026-08-07)    |
| 3   | Protect the signature fixtures      | Critical | ✅ Done                                          |
| 8   | Post-deploy smoke test              | High     | ✅ Done, confirmed on a real deploy (2026-08-10) |
| 10  | Publish `audit_log` to Realtime     | Medium   | ✅ Done (2026-08-05)                             |
| 11  | Uptime and latency monitoring       | High     | 🔄 Latency done; uptime still needs a prober     |
| 12  | Retire `GET /api/admin/departments` | Medium   | ✅ Done                                          |

**§12 improvements**: ✅ Realtime registry documented · ✅ changelog CI check · ✅ report
provenance · 🔄 `audit_log` backup gap documented, not implemented · 🔄 signature threshold
calibration — needs pilot data · ⬜ SMTP synthetic monitor · ⬜ risk-config dry-run endpoint.

Full history for everything marked ✅ lives in `docs/CHANGELOG.md`, not here.

---

## What is left

1. **Rotate exposed credentials** — reported done 2026-08-07, not re-verified (see
   `docs/KEY_ROTATION.md`). Two more passwords have since been typed into chat in plaintext —
   worth rotating.
2. **Uptime monitoring** — `/api/health` exists; needs an external prober pointed at it, not `/`.
3. **Signature threshold calibration** — threshold confirmed safe (`0.55`); still blocked on
   real labelled genuine/forged samples from the pilot. Drop folder ready at
   `tests/signature-calibration-samples/`.
4. **E2E OTP mailbox** (see `docs/E2E_OTP_SETUP.md`) — mechanism built, CSO test login fixed.
   OTP delivery to it is still broken, likely a stale `GMAIL_APP_PASSWORD`. Also open:
   Dean/Verifier test accounts, six GitHub secrets. Found along the way: `/api/auth/resend-otp`
   reports success even when the send fails — worth fixing.

## Cron jobs were silently broken — fixed (2026-08-12)

Found while manually testing the new digest job. `cron.job_run_details` showed
`weekend-code-reminders` has failed **every run since 2026-07-11** — every `pg_net`-based cron
job called `extensions.http_post`, which doesn't exist (`pg_net`'s functions live in `net`).
Weekend collection-code reminder emails have never actually been sent, for the entire time that
feature has existed. Fixed for all three jobs (`weekend-code-reminders`, `overdue-key-check`,
`daily-digest`) in `20260812140000_fix_pg_net_schema.sql`; also raised each job's timeout to 25s.
Verified via a real manual trigger against production, not assumed from a clean migration apply.
Full writeup in `docs/CHANGELOG.md`.

## Settings tabs — real vs mockup (2026-08-11/12)

Checked every settings tab across CSO, Dean, Requester against source + `docs/API.md`.

- **Real**: Account (all roles), CSO → Risk rules, Dean → Signature & stamp, CSO → Operational,
  Requester → Notifications, Dean → Notifications, Dean's and CSO's "daily digest" (all
  2026-08-12 — full writeups in `docs/CHANGELOG.md`).
- **Still mockup**: CSO → the other three rows (anomaly in-app/email, signature mismatches) —
  local state only, no persistence, not yet audited for whether those underlying email
  behaviours exist at all. Only CSO's digest row is real.

**Correction**: this doc previously said the Requester tab's "weekend request decided" email
didn't exist. It did — `hod-decision`'s `notifyRequester` already sent it. Only "collection code"
and "return deadline reminder" were genuinely missing; 2026-08-12's work added those two and
wired a real preference gate onto the one that already existed.

## CSO signature-mismatch review — verified end-to-end (2026-08-11)

Confirmed against the local Docker Supabase stack, not production — see
`tests/manual/signature-mismatch-review/README.md` to reproduce.

- A real signature mismatch genuinely holds the request (`HELD_SIGNATURE_MISMATCH`) and writes
  a `SIGNATURE_MISMATCH` audit row — a true gate, unlike the non-blocking risk-tier CSO queue.
- `/cso/dashboard`'s review dialog is real, working UI, not just an audit-log notice.
- Resolving it writes a second audit row and moves the request to a terminal state.
