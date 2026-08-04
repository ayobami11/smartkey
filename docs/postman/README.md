# SmartKey — Postman collection

An importable Postman collection covering **every** server-side route in SmartKey: 58 unique method + path combinations across 65 requests, grouped by the role that calls them.

This is the "how do I actually hit it" companion to [`docs/API.md`](../API.md), which stays the spec-level reference.

| File                                | What it is                                                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `SmartKey.postman_collection.json`  | The collection. Import this.                                                                                                           |
| `SmartKey.postman_environment.json` | Environment with `baseUrl` + credential placeholders. All secret values ship **empty** — fill them in locally, never commit them back. |

---

## Import

1. Postman → **Import** → drop both JSON files in.
2. Select the **SmartKey — Local** environment (top-right dropdown).
3. Fill in the credential variables for whichever role(s) you're testing.
4. Start the app: `npm run dev` (defaults to `http://localhost:3000`).

Testing against a deployed environment: change `baseUrl` only. Everything else is relative.

---

## The one thing that will waste your afternoon

**Every authenticated request needs a `Referer` header.** Get this wrong and you'll get a `401` while being demonstrably logged in.

SmartKey stores each role's session in its **own** cookie namespace (`sb-<project-ref>-cso`, `-dean`, `-verifier`, `-requester`) so a CSO and a Requester can be signed in simultaneously in one browser without clobbering each other. To read the right cookie, the server has to know which namespace a request belongs to. It resolves that in order:

1. An explicit namespace argument — only auth routes do this.
2. The `x-smartkey-namespace` header — **set by the middleware itself**, and overwritten on every request. Sending it yourself does nothing (this is deliberate: it means the namespace can't be spoofed).
3. `namespaceFromReferer(referer)` — the calling page's URL.
4. Otherwise the transient `activate` namespace.

For a page navigation like `/cso/users`, step 3 never even runs — the path gives it away. But `/api/*` paths carry no role prefix, so **for API calls the `Referer` is the only signal**. Without one you land on `activate`, which holds no session, and you get 401.

Every request in this collection already carries the right header. If you copy one into your own code or a bare curl, carry it too:

| Calling as | Header                                     |
| ---------- | ------------------------------------------ |
| CSO        | `Referer: http://localhost:3000/cso`       |
| Dean       | `Referer: http://localhost:3000/dean`      |
| Verifier   | `Referer: http://localhost:3000/verifier`  |
| Requester  | `Referer: http://localhost:3000/requester` |

From a browser this is free — `fetch` sets `Referer` automatically from the page you're on, which is why the app works without anyone thinking about it. It only bites when calling from Postman, curl, or a test runner.

Relevant source: `src/lib/supabase/middleware.ts`, `namespaceFromReferer` in `src/lib/supabase/cookies.ts`, `createServerClient` in `src/lib/supabase/server.ts`.

---

## Signing in

Auth is **cookie-based, not Bearer**. Postman's cookie jar handles it automatically once you log in — don't add an `Authorization` header to user routes, it's ignored.

### Requester — one step

`00 — Auth → Login (Requester)`. Done. REQUESTER is the only role exempt from MFA.

### CSO / Dean / Verifier — two steps

1. `00 — Auth → Login (CSO)` → responds `{ session: null, role, mfa_required: true }` and emails a 6-digit code.
2. Read the code from the inbox, set the `otp` variable, run `Verify OTP`.

The session cookie is written at step 1 but isn't usable until step 2 clears MFA. The code is stored as a SHA-256 hash with a 10-minute expiry and is wiped on success, so it can't be replayed.

No mail arriving in local dev? Check `GMAIL_USER` / `GMAIL_APP_PASSWORD` in `.env.local` — the login route returns a `500` with the underlying SMTP error when the send fails, so the response body will usually tell you.

### Switching roles

Each role has its own cookie, so you don't need to log out to switch — just log in as the other role and use requests with the matching `Referer`. Both sessions coexist.

---

## Getting IDs to test with

Most write routes need a UUID. The collection auto-captures what it can via test scripts, so run these first and the variables fill themselves in:

| Run this                                       | Fills                         |
| ---------------------------------------------- | ----------------------------- |
| `05 — CSO · administration → List units`       | `unitId`                      |
| `05 — CSO · administration → List users`       | `userId`                      |
| `05 — CSO · administration → Create key`       | `keyId`                       |
| `03 — Verifier → Start shift`                  | `shiftId`                     |
| `01 — Requester → Submit request`              | `requestId`, `collectionCode` |
| `01 — Requester → Request return code`         | `returnCode`                  |
| `04 — CSO · oversight → Generate shift report` | `reportId`                    |
| `07 — Public → Submit guest weekend request`   | `guestToken`, `requestId`     |

For a database with nothing in it, `supabase/seed.sql` sets up units, keys and a CSO profile.

---

## A full flow worth walking

The weekday issue-and-return loop, end to end — it touches four roles and is the system's highest-frequency path:

1. **CSO** → `Create key`, then `Nominate collector` to authorise a requester for it.
2. **Requester** → `Submit request (weekday)`. Risk engine runs, 6-digit code minted, 10-minute expiry.
3. **Verifier** → `Start shift`, then `Collect key (issue)` with that code. Key is now out.
4. **Requester** → `Request return code`. 15-minute return code.
5. **Verifier** → `Return key (verified by code)`. Loop closed, fully audited at both ends.

The weekend variant differs in an important way: approval does **not** mint a code. `Submit request (weekend)` → Dean `Approve` (status becomes `APPROVED`) → the requester mints a short-lived code on the day itself via `Get weekend code`. A code that sat valid all week would defeat the point of a one-time code.

---

## Things the collection documents that aren't obvious from the route names

- **`hod-decision` returns `"APPROVED"` / `"DECLINED"`, not `"CODE_ISSUED"`.** No code exists at Dean-decision time.
- **A held signature mismatch is HTTP 200.** `{ status: "HELD_SIGNATURE_MISMATCH", mismatch_pct }` — a held approval is a business outcome, not a transport error. Check the status field, not just the HTTP code.
- **There is no `PENDING_CSO` status.** `cso-queue` is a review surface over already-issuable requests, not an approval gate. `cso-decision` with `APPROVED` changes no state at all — it records that the CSO looked and let it stand.
- **`GET /api/admin/users` takes no query params and doesn't paginate.** It returns every non-deactivated profile; the CSO table filters client-side. `docs/API.md` used to promise cursor pagination here — it doesn't exist.
- **`POST /api/requests/collect` ignores any client-supplied `verifier_id`.** The verifier comes from the session, so a collection can't be attributed to another officer.
- **`register` and `activate-hod` have no `token` field.** The invite link resolves through `GET /api/auth/callback` into an `activate`-namespace session first; those routes only read it. They aren't directly runnable from Postman without doing the browser step.
- **`DELETE /api/admin/authorisations/...` returns 204 with no body.** `apiFetch` normalises that to `{ data: null, error: null, status: 204 }`.

---

## Response envelope

Every route returns the same shape (`src/types/api.ts`):

```ts
type ApiResponse<T> =
  | { data: T; error: null; status: number }
  | { data: null; error: string; status: number };
```

`error` is always a user-facing string — safe to surface directly in UI. Stack traces and raw Supabase errors never appear in the body; server-side failures return a correlation ref instead (`"Internal error. Ref: 7f3e9b22"`) and the detail is logged.

Frontend code should go through `apiFetch` (`src/lib/api.ts`) rather than raw `fetch` — it unwraps the envelope, handles 204, converts network failure into `status: 0` instead of throwing, and sets `Content-Type` only for non-`FormData` bodies.

---

## curl equivalents

Not a Postman user? The two things to carry over are the cookie jar and the `Referer`:

```bash
# 1. Log in, persisting cookies to a jar
curl -c jar.txt -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"requester@unilag.edu.ng","password":"..."}'

# 2. Reuse the jar AND send a Referer matching the role area
curl -b jar.txt http://localhost:3000/api/requests/my \
  -H 'Referer: http://localhost:3000/requester'
```

Drop the `-H 'Referer: ...'` from step 2 and you get a 401.

---

## Updating the published collection (the link does not change)

The collection is published to Postman as **SmartKey API** in _Firdous's Workspace_:

```
collection id  c7912f2c-fc39-46ce-aebb-6a396b2cd0ff
uid            44971333-c7912f2c-fc39-46ce-aebb-6a396b2cd0ff
```

**Editing it in place keeps the same id, so the shared link stays valid.** You never need to re-import and hand out a new URL. Only _creating_ a collection mints a new id — importing this JSON as a fresh collection is what would break the link, so don't do that to apply an update.

Two ways to edit in place, both preserving the link:

- **In the Postman app** — edit the request, save. Done.
- **Via the Postman MCP server** — `createCollectionRequest` to add one, `updateCollectionRequest` to change one, `putCollection` to replace the whole thing. All take the collection id above and update the existing collection.

The JSON file in this folder is a **version-controlled snapshot**, not the source of truth for the published link. Keep it in step so code review can see API changes, but treat the published collection as the live artefact. After changing one, mirror it to the other:

- Postman → repo: export the collection (v2.1 format) over `SmartKey.postman_collection.json`.
- Repo → Postman: apply the same edit through the MCP or the app. Do **not** import the file as a new collection.

## Keeping this current

The collection is hand-maintained, same as `docs/API.md`. When you add or change a route, update the published collection, this JSON snapshot, and `docs/API.md`.

To re-check coverage against the filesystem. The first command needs `jq`; if you don't have it, the same extraction is a few lines of `node -e` over the collection JSON (`CLAUDE.md` notes `node` as the project's JSON-parsing tool of choice). The second command is pure shell.

```bash
# unique METHOD + path in the collection
jq -r '[.item[].item[] | "\(.request.method) /\(.request.url.path|join("/"))"] | unique | .[]' \
  docs/postman/SmartKey.postman_collection.json | sed 's/{{[a-zA-Z]*}}/:param/g' | sort -u

# unique METHOD + path actually implemented
for f in $(find src/app/api -name route.ts); do
  p=$(echo "$f" | sed 's|src/app||; s|/route.ts||; s|\[[a-z_]*\]|:param|g')
  grep -oE '^export const (GET|POST|PATCH|PUT|DELETE)' "$f" | awk -v p="$p" '{print $3, p}'
done | sort -u
```

`diff` the two. As of the last sync both sides were 58 and matched exactly.
