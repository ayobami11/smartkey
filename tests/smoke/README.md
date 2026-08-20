# Post-deployment smoke test

`smoke.mjs` hits SmartKey's critical path against a deployed URL and exits
non-zero if the deployment is not fit to promote. It is run by
[`.github/workflows/post-deploy-smoke.yml`](../../.github/workflows/post-deploy-smoke.yml)
as soon as Vercel reports a deployment ready.

Implements item 8 of [`docs/REVIEW_ACTIONS_BACKEND.md`](../../docs/REVIEW_ACTIONS_BACKEND.md).

Zero dependencies — Node 20+ built-ins only. No dependency install step
needed, deliberately: a broken dependency tree must not be able to break the
thing that tells you whether production is up.

---

## Running it locally

```bash
SMOKE_BASE_URL=http://localhost:3000 \
SMOKE_REQUESTER_EMAIL=requester@unilag.edu.ng \
SMOKE_REQUESTER_PASSWORD='…' \
node tests/smoke/smoke.mjs
```

| Variable                   | Required | Purpose                                              |
| -------------------------- | -------- | ---------------------------------------------------- |
| `SMOKE_BASE_URL`           | yes      | Deployment to test. Trailing slash is stripped.      |
| `SMOKE_REQUESTER_EMAIL`    | yes      | A dedicated REQUESTER account (see below).           |
| `SMOKE_REQUESTER_PASSWORD` | yes      |                                                      |
| `SMOKE_CSO_EMAIL`          | no       | A CSO account, used for the MFA-shape check only.    |
| `SMOKE_CSO_PASSWORD`       | no       | Omit both and that one check is skipped, not failed. |
| `SMOKE_TIMEOUT_MS`         | no       | Per-request timeout, default `20000`.                |

Exit codes: `0` pass · `1` at least one check failed · `2` misconfigured
(no base URL or no requester credentials).

## GitHub secrets to configure

Repository → Settings → Secrets and variables → Actions.

**Secrets (required)**

- `SMOKE_REQUESTER_EMAIL`
- `SMOKE_REQUESTER_PASSWORD`

**Secrets (optional)**

- `SMOKE_CSO_EMAIL`, `SMOKE_CSO_PASSWORD` — enables the MFA-contract check.
- `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` — only needed if you turn
  on auto-promote or auto-rollback.

**Variables (both default to off)**

- `SMOKE_AUTO_PROMOTE=true` — promote a preview deployment to production once the
  smoke test passes.
- `SMOKE_AUTO_ROLLBACK=true` — roll production back if the smoke test fails
  against a production deployment.

### About the smoke account

Provision one REQUESTER per environment, used by nothing else. It should be
authorised for **no keys** — the smoke test never submits a request, so it does
not need one, and an unauthorised account cannot accidentally trigger a real key
issue if a future check is written carelessly.

---

## What it checks

| #   | Check                                                                      | Why it is here                                                                     |
| --- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | `GET /` returns 2xx/3xx                                                    | The app is serving at all.                                                         |
| 2   | `POST /api/auth/login` with a wrong password → 401                         | Auth is genuinely validating, not blanket-accepting.                               |
| 3   | `POST /api/auth/login` as REQUESTER → 200, session, `mfa_required: false`  | Supabase Auth reachable; the cookie is written.                                    |
| 4   | `POST /api/auth/login` as CSO → 200, `mfa_required: true`, `session: null` | The MFA gate has not regressed open. (Optional.)                                   |
| 5   | `GET /api/requests/my` with cookie + `Referer` → 200, array                | The full authenticated read path: session → namespace → RLS-scoped Postgres query. |
| 6   | `GET /api/requests/my` **without** `Referer` → 401                         | Regression guard on cookie-namespace isolation.                                    |
| 7   | `GET /api/requests/live-queue` → 401 anon / 403 as requester               | Route deployed and role-gated.                                                     |
| 8   | `POST /api/requests/collect` → 401 anon / 403 as requester                 | Route deployed and role-gated.                                                     |
| 9   | `POST /api/keys/return` → 401 anon / 403 as requester                      | Route deployed and role-gated.                                                     |

---

## Two decisions that look like shortcuts and are not

### MFA: the requester path is completed, the privileged path is shape-checked

CSO, Dean and Verifier logins return `{ session: null, mfa_required: true }` and
email a 6-digit code (`src/app/api/auth/login/route.ts`). A CI runner cannot read
an inbox. The alternatives were both worse than the shape check:

- A test-only MFA bypass in production code, guarded by an env flag — a real
  security hole in exchange for a test, and a permanent CI credential that
  bypasses MFA is exactly the thing MFA exists to prevent.
- An IMAP/mailbox integration — a second live dependency that will flake on its
  own schedule and produce false "production is down" alarms.

So: REQUESTER (the only MFA-exempt role) gives a genuine session, which is what
checks 5–9 need. For CSO we assert the _contract_ — 200, `mfa_required: true`,
`session: null` — which still catches a broken auth deploy, a Supabase outage, or
an accidental regression that lets a privileged role in without a second factor.

`email_delivery_failed: true` in that response is **not** a failure. SMTP delivery
was made non-blocking on 2026-08-02 precisely so an SMTP outage cannot lock out
every MFA role; the script logs a warning and continues.

### The smoke test never mutates production state

`POST /api/requests/collect` and `POST /api/keys/return` are VERIFIER-only and
check the role _before_ parsing the body or calling any RPC. Hitting them
anonymously (expect 401) and with a REQUESTER session (expect 403) proves the
route is deployed, reachable, resolving the right cookie namespace and enforcing
its gate — without issuing or returning a real key on every deploy, and so
without a trail of garbage `requests` rows and audit entries that would pollute
the very audit log the product is built around.

Completing a real issue-and-return loop would need a VERIFIER session, which
brings us back to the MFA problem above. If MFA ever gains a service-account
exemption, the honest upgrade is to run that loop against a **preview**
deployment pointed at a non-production database — not against production.

---

## The trap: `Referer` on every authenticated call

Auth is cookie-based, not Bearer. Each role's session lives in its own cookie
namespace (`sb-<ref>-cso`, `-dean`, `-verifier`, `-requester`), and `/api/*` paths
carry no role prefix, so the `Referer` header is the **only** signal the server
has for which namespace to read. Omit it and you resolve the empty `activate`
namespace and get a 401 while demonstrably logged in.

Check 6 exists to keep that behaviour honest. Full explanation in
[`docs/postman/README.md`](../../docs/postman/README.md).
