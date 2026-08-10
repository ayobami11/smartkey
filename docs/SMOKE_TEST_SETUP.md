# Arming the post-deploy smoke test

Handover note, written 2026-08-04. Everything below is a dashboard or shell action —
none of it can be done from the repo.

The workflow (`.github/workflows/post-deploy-smoke.yml`) is already deployed and
already safe to leave unconfigured: `tests/smoke/smoke.mjs` exits **2** for "no
credentials", the workflow treats 2 as a skip, and the run goes **green with a
warning**. Nothing is red while this sits unfinished. Pick it up when convenient.

---

## What the secrets are

They are login credentials for real accounts on the deployed app. The smoke test
signs in over HTTP exactly as a user would — there is no test-only bypass, and
deliberately so: a test-only MFA bypass in production code would be a permanent hole
traded for a convenience.

| Secret                            | Required? | What it is                                                     |
| --------------------------------- | --------- | -------------------------------------------------------------- |
| `SMOKE_REQUESTER_EMAIL`           | **yes**   | Email of an ACTIVE `REQUESTER`                                 |
| `SMOKE_REQUESTER_PASSWORD`        | **yes**   | That account's password                                        |
| `SMOKE_CSO_EMAIL`                 | optional  | Email of an ACTIVE `CSO`                                       |
| `SMOKE_CSO_PASSWORD`              | optional  | That account's password                                        |
| `VERCEL_PROTECTION_BYPASS_SECRET` | **yes**\* | See below — needed for any deployment except the custom domain |

\* Not needed if you only ever test the custom domain (e.g. `smartkey-ochre.vercel.app`).
Needed for the automatic `deployment_status`-triggered runs, since those test the raw
per-deployment `*.vercel.app` URL, which sits behind Vercel's Deployment Protection.
Generate it in Vercel: Project Settings → Deployment Protection → Protection Bypass for
Automation → Add Secret. Without it, every automatic run fails with responses that look
like "not JSON" / "not the envelope" — that's Vercel's own auth wall, not the app.

**Only the requester pair is required.** Requester is the one role exempt from email
OTP, so it is the only login completable unattended. Without it the script exits 2
and nothing runs at all.

The CSO pair enables exactly one extra assertion — "challenges the CSO for MFA
(shape only)". It never completes the OTP; it just checks the response _shape_. If
unset, that single check is skipped cleanly and everything else still runs.

---

## Step 1 — pick or create the requester account

Current ACTIVE requesters on the project:

- `xafegok266@dysonc.com` — disposable-domain test account. **Preferred.**
- one real staff member's personal Gmail — **do not use.**

Why not the real one: the smoke test logs in on _every successful deploy_. Using a
real person's account writes audit rows attributed to them on every deploy, polluting
the evidentiary trail the product exists to protect.

The other four requester accounts are `DEACTIVATED` and will not authenticate.

**Better than reusing either**: provision a dedicated `smoke-test@…` requester
through the normal CSO flow and activate it. Reusing an account someone has been
manually testing with means the smoke test inherits whatever state that account is
in — and a smoke test that fails for reasons unrelated to the deploy is a smoke test
people learn to ignore.

## Step 2 — set a password you actually know

`dysonc.com` is a temp-mail domain, so a reset _link_ is likely unreceivable. Set the
password directly:

> Supabase Dashboard → Authentication → Users → select the user → set password

## Step 3 — add the secrets

Web UI: repo → Settings → Secrets and variables → Actions → New repository secret.

Or, from a machine with `gh` installed (it is not available in the dev container):

```bash
gh secret set SMOKE_REQUESTER_EMAIL    --repo ayobami11/smartkey
gh secret set SMOKE_REQUESTER_PASSWORD --repo ayobami11/smartkey
```

Omit `--body` deliberately — `gh` then prompts for the value, so it never enters
shell history.

## Step 4 — verify

Trigger the workflow manually (it accepts `workflow_dispatch` with a `url` input) or
wait for the next deploy. Expect 12 checks. The run summary lists each one.

---

## Before adding the CSO pair — read this

The CSO account `mohammedfirdous682@gmail.com` had its password committed in plain
text in `scripts/test-cso-endpoints.mjs` and pushed to GitHub in commit `0047369`. It
has been public ever since. See the 2026-08-04 entry in `docs/CHANGELOG.md`.

**Change that password before putting it in a CI secret.** Storing a
known-compromised credential in Actions is worse than leaving the optional check
skipped.

The second CSO account is a separate person's; the same "don't automate against a
real user" reasoning applies.

---

## Related outstanding work

- Rotate the `service_role` key — it was exposed in the same script and in the
  migration history. See `docs/CHANGELOG.md`, 2026-08-04.
- The `promote` / `rollback` jobs in the workflow are written but gated off. Leave
  them off until the smoke run has a track record; automatic rollback driven by a
  test nobody trusts yet is a way to turn one bad deploy into two.
