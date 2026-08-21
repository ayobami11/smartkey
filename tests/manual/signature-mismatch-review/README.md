# Testing the CSO signature-mismatch review flow

Manually exercises the full HELD_SIGNATURE_MISMATCH loop — Dean submission →
held request → CSO review dialog → resolution — against the **local Docker
Supabase stack only**. No real signatures, no email, no production data.

## Why this exists

The mismatch hold and the CSO's review dialog (`/cso/dashboard` →
"Signature mismatches") are easy to describe but hard to casually verify —
reaching a `HELD_SIGNATURE_MISMATCH` state for real requires a Dean with a
reference signature, a pending weekend request, and a genuinely mismatching
submission. These scripts build that state end to end using synthetic,
code-drawn signatures (no one's real signature) and a throwaway local
Dean/CSO/Requester.

## Prerequisites

- Local Supabase running: `supabase start`
- Playwright's Chromium installed: `bunx playwright install chromium` (plus
  `sudo bunx playwright install-deps chromium` the first time, for OS libs)

## Run it

```bash
# 1. Dev server, pointed at the LOCAL stack (not .env.local's real project)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key from `supabase status`> \
SUPABASE_SERVICE_ROLE_KEY=<local service_role key from `supabase status`> \
bun run dev

# 2. In another terminal, from the repo root:
node tests/manual/signature-mismatch-review/seed.mjs
# prints requestId and subUrl — use them below

node tests/manual/signature-mismatch-review/trigger-mismatch.mjs <requestId> <subUrl>
# real POST to /api/requests/hod-decision as the seeded Dean — expect
# {"status":"HELD_SIGNATURE_MISMATCH", ...}

node tests/manual/signature-mismatch-review/view-review-dialog.mjs [outDir]
# mints a CSO session, opens a real headless browser at /cso/dashboard,
# screenshots the alert + dialog, then declines it. Screenshots default to
# the current directory — pass a scratch path as outDir to avoid littering
# the repo (they're not meant to be committed).
```

Re-running `seed.mjs` is safe — it reuses the same three local test users
instead of deleting them, because once one is referenced by an `audit_log`
row (which running this flow does), the append-only FK permanently blocks
deleting it. That's the audit log's immutability guarantee working as
designed, not a bug to route around.

## What it proves

- `seed.mjs` + `trigger-mismatch.mjs` hit the real `hod-decision` route and
  the real `verifySignature` pipeline — the `HELD_SIGNATURE_MISMATCH` result
  and the `SIGNATURE_MISMATCH` audit row are genuine, not mocked.
- `view-review-dialog.mjs` renders the actual `/cso/dashboard` UI: the
  mismatch alert card, the side-by-side reference/submitted images, the
  acknowledgement gate on Decline/Approve, and the persistent resolution
  confirmation — then leaves a real `DECLINED` request + `HOD_DECLINED`
  audit row behind.

## Cleanup

The local stack is fully disposable — `supabase stop --no-backup` wipes
everything. To tidy up without stopping the stack:

```sql
delete from requests where requested_room = 'LOCAL_TEST_ROW';
```

The three seeded profiles can't be deleted once an audit entry references
them (see above) — leave them, or stop and restart the local stack.
