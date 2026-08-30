# Review actions — Backend

Backend-owned items from the 2026-08-04 system review. Status as of 2026-08-12.

## Status

| #   | Item                                | Priority | Status                                                    |
| --- | ----------------------------------- | -------- | --------------------------------------------------------- |
| 1   | Reconcile the migration history     | Critical | ✅ Done (2026-08-07)                                      |
| 2   | pgTAP tests for RPCs and RLS        | Critical | ✅ Done, 75 tests, wired into CI (2026-08-07)             |
| 3   | Protect the signature fixtures      | Critical | ✅ Done                                                   |
| 8   | Post-deploy smoke test              | High     | ✅ Done, confirmed on a real deploy (2026-08-10)          |
| 10  | Publish `audit_log` to Realtime     | Medium   | ✅ Done (2026-08-05)                                      |
| 11  | Uptime and latency monitoring       | High     | ✅ Done (2026-08-30) — monitor live against `/api/health` |
| 12  | Retire `GET /api/admin/departments` | Medium   | ✅ Done                                                   |

---

## What is left

1. **Rotate exposed credentials** — reported done 2026-08-07, not re-verified (see
   `docs/KEY_ROTATION.md`). Two more passwords have since been typed into chat in plaintext —
   worth rotating.
2. **Signature threshold calibration** — threshold confirmed safe (`0.55`); still blocked on
   real labelled genuine/forged samples from the pilot. Drop folder ready at
   `tests/signature-calibration-samples/`.
3. **E2E OTP mailbox** (see `docs/E2E_OTP_SETUP.md`) — ✅ Done (2026-08-18). All four test
   accounts (CSO/Dean/Verifier/Requester) already existed in production, `ACTIVE`, just
   under `smartkey.tests+<role>@gmail.com`, not the `smartkey.e2e.tests+<role>@gmail.com` the
   doc described — doc corrected. Found and fixed two real bugs: (1)
   `.github/workflows/e2e.yml`'s "Run E2E tests" step never set `GMAIL_USER`/`GMAIL_APP_PASSWORD`
   in its `env:` block, so the app-under-test had no SMTP credentials in CI at all — OTP mail
   could never send, independent of any mailbox/password staleness; (2) `/api/auth/resend-otp`
   reported success even when the send genuinely failed — now returns `email_delivery_failed`
   (mirroring `/api/auth/login`'s existing field), but only to a caller already authenticated as
   that profile, so anonymous callers still get no enumeration signal. `TEST_CSO_PASSWORD` /
   `TEST_DEAN_PASSWORD` / `TEST_VERIFIER_PASSWORD` were unknown, so those three accounts' passwords
   were reset directly in Supabase Auth (`auth.users.encrypted_password` via `pgcrypto`, same
   technique as the 2026-08-12 requester-account fix). All 10 secrets
   (`E2E_OTP_IMAP_USER`/`E2E_OTP_IMAP_APP_PASSWORD`, `GMAIL_USER`/`GMAIL_APP_PASSWORD`, and the
   three `TEST_*_EMAIL`/`TEST_*_PASSWORD` pairs) confirmed added to the GitHub repo by the user.
   Not yet verified: an actual green CI run exercising the full flow — worth watching the next PR's
   E2E job rather than assuming success from configuration alone.
