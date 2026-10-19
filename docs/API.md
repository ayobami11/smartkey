# SmartKey — API Route Catalogue

This file is the single reference for every server-side route in SmartKey. It mirrors what `design-system/screens.md` does for UI screens: a spec-level view of what exists, who can call it, what it expects, and what it returns — distinct from the implementation in `src/app/api/`.

**Keep this file up to date on every route addition or change.**

---

## How to read this file

Each route entry shows:

- **Method + path** — the HTTP verb and URL.
- **File** — the `route.ts` that implements it under `src/app/api/`.
- **Roles** — which roles are permitted (`CSO` | `DEAN` | `VERIFIER` | `REQUESTER` | `ALL` | `SYSTEM`). Some routes/statuses/RPCs keep the historical `hod` name (e.g. `hod-decision`, `PENDING_HOD`) for continuity — see `docs/GLOSSARY.md`.
- **Request** — required body fields with their Zod-equivalent types.
- **Response** — the `data` payload on success.
- **Errors** — expected non-200 codes and the conditions that trigger them.
- **RPC** — the Postgres function called for mutations (see `docs/DATABASE.md`).

---

## Response envelope

Every route returns this shape. The status field mirrors the HTTP status code.

```typescript
type ApiResponse<T> =
  | { data: T; error: null; status: number }
  | { data: null; error: string; status: number };
```

Error strings are user-facing. Stack traces and Supabase error messages never appear in the response body — they are logged server-side with a correlation reference that is included in the error string.

Routes build the envelope only through `respond.ok` / `fail` / `error` / `internal` / `noContent` in `src/lib/http/respond.ts`, which sets the envelope `status` and the HTTP status from the same value. `respond.internal(logMessage, context)` logs under a fresh ref and returns `500 "Internal error. Ref: <ref>"`.

---

## Auth conventions

Route handlers are wrapped in `route()` from `src/lib/http/route.ts`. Every route is on it except the four listed under "Not wrapped" below. The migration ran in six batches, finishing 2026-10-14: `/api/requests/` (batch 1), `/api/public/` (batch 2), `keys/`, `shifts/`, `reports/` and `incidents` (batch 3), `/api/admin/` plus the `ai/risk-alerts` and `ai/signature-alerts` reads (batch 4), the `/api/cron/` routes (batch 5) and `/api/profile/` (batch 6). `route()` runs these checks in a fixed order before the handler:

1. **Auth**, chosen per route with `auth`:
   - `'user'` validates the Supabase session with `getUser()`, never `getSession()`. No session → `401 Unauthorized`.
   - `'cron'` requires `Authorization: Bearer ${CRON_SECRET}`, compared in constant time (`timingSafeEqual` over SHA-256 digests). An unset `CRON_SECRET` → `500` with a ref; a wrong or missing header → `401 Unauthorized`.
   - `'public'` performs no check. Used by the session-less guest and one-click Dean decision routes, which authorise by an unguessable token instead.
2. **Role**, only when `roles` is given. The role comes from `profiles.role`, never from the JWT claim alone. No profile row → `401 Unauthorized`; a `DEACTIVATED` profile → `401 Unauthorized` (since 2026-10-14); a role not in the list → `403 Forbidden`. With `roles` omitted there is no profile query at all, so no status check either.

   The `DEACTIVATED` check exists because deactivation bans the user in Supabase Auth, but a session issued before the ban stays valid until its access token expires. It answers `401` rather than `403` because the account no longer has a usable session: a `401` sends the client to sign in, where the ban stops them, while a `403` reads as "wrong page". `PENDING_ACTIVATION` is not refused — activation runs through the unwrapped `auth/*` routes. `GET /api/storage/object` applies the same check itself.

3. **Path params**, when a `params` schema is given. Failure → the route's `paramsError`, by default `404 Not found`.
4. **Query params**, when a `query` schema is given (since 2026-10-15). The search params are parsed as a plain object of strings (a repeated key keeps its last value). Failure → the route's `queryError`, by default `422 Invalid query parameters`. The shared pieces — `pageLimit`, `timestamp`, `csvEnum` — live in `src/lib/http/query.ts`; their job is to stop a malformed value before PostgREST turns it into a Postgres cast error and a `500`.
5. **JSON body**, when a `body` schema is given. Unparseable JSON or a schema failure → `422 Invalid request body`. Multipart routes omit `body` and read `ctx.request` themselves.
6. **Handler.** Any throw, from the handler or from the checks above, becomes an enveloped `500 Internal error. Ref: <ref>`, logged as `<name>: unhandled error`.

Not wrapped, by design: the `auth/*` routes (they establish sessions and set cookies or redirect), `GET /api/health`, `GET /api/storage/object` (returns bytes) and `POST /api/ai/verify-signature`. They still build their envelopes through `respond.*`.

- **RLS is the authoritative enforcement layer**; route-level role checks are defence in depth.
- **The service-role key is server-only, and it is used by routes, not only Edge Functions.** `createAdminClient()` (`src/lib/supabase/admin.ts`) bypasses RLS. It is used by:
  - the public token routes (`/api/public/*`), whose RPCs are revoked from `anon`;
  - the cron routes (`/api/cron/*`);
  - routes that read past RLS and apply their own check, such as `GET /api/keys/availability`, `GET /api/keys/out` and `GET /api/storage/object`;
  - specific admin writes.

  It is never imported by browser code. `route()` never creates it implicitly: `'public'` and `'cron'` handlers get no Supabase client, so each use of the service role is visible in the handler.

### RPC error mapping

RPCs raise `'<KIND>: <detail>'` (a few raise the bare `'<KIND>'`). `callRpc` / `callRpcVoid` (`src/lib/rpc/call-rpc.ts`) parse the exact prefix into `{ kind, detail }`; an unrecognised message becomes `INTERNAL`, is logged there with a ref, and is never shown to the client. Routes turn the result into a response with `rpcFail(error, overrides?)` from `src/lib/http/rpc-errors.ts`, which reads this default catalogue (`RPC_ERROR_HTTP`):

| Kind                  | Status | Default message                                                                                             |
| --------------------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| `NOT_AUTHENTICATED`   | 401    | Unauthorized                                                                                                |
| `FORBIDDEN`           | 403    | Forbidden                                                                                                   |
| `NOT_AUTHORISED`      | 403    | Not authorised for this key                                                                                 |
| `NOT_FOUND`           | 404    | Not found                                                                                                   |
| `EXPIRED_CODE`        | 404    | Code has expired                                                                                            |
| `BAD_RETURN_CODE`     | 404    | Return code not recognised. Ask the requester to check it.                                                  |
| `EXPIRED_RETURN_CODE` | 404    | Return code has expired. Ask the requester to generate a new one.                                           |
| `CONFLICT`            | 409    | This action conflicts with the request's current state.                                                     |
| `NO_KEYS_AVAILABLE`   | 409    | No key is available for this room right now. Every key is out or reserved — try again once one is returned. |
| `NOT_ISSUED`          | 409    | This key is not currently issued.                                                                           |
| `NOT_EXPIRED`         | 409    | This code has not expired yet.                                                                              |
| `DUPLICATE_PROFILE`   | 409    | Email already registered                                                                                    |
| `AUTH_USER_NOT_FOUND` | 409    | No auth account found for this email. Send an invite via Supabase Auth first, then provision.               |
| `TOO_EARLY`           | 422    | A collection code can only be generated on the requested date.                                              |
| `REQUESTER_INACTIVE`  | 422    | This user account is deactivated and cannot be authorised                                                   |
| `NO_VERIFICATION`     | 422    | Enter the return code, or give a reason to return without one.                                              |
| `VALIDATION`          | 422    | Invalid request                                                                                             |
| `INVALID_DECISION`    | 422    | Invalid decision                                                                                            |
| `INVALID_RULES`       | 422    | Invalid rule configuration                                                                                  |
| `INVALID_TIER_BOUNDS` | 422    | high_min must exceed medium_min                                                                             |
| `INVALID_ZONE_HOURS`  | 422    | Invalid zone hours                                                                                          |
| `INVALID_CONFIG`      | 422    | Invalid operational configuration                                                                           |
| `INTERNAL`            | 500    | Internal error. Ref: `<ref>` (not overridable)                                                              |

Rules:

- **Overrides are per kind.** A route passes `{ KIND: override }` for the kinds whose copy should differ. An override is one of:
  - a string, which replaces the message and keeps the default status;
  - an `{ status, message }`, which replaces both;
  - a function of the RPC's `detail`, returning either of those or `undefined` to fall back to the default.

  Routes never write their own `mapRpcError`. A kind added to `RPC_ERROR_KINDS` without a catalogue row is a type error.

- **`byDetail(cases, fallback?)`** branches one kind on its detail text, for RPCs that raise one kind for different situations (e.g. `nominate_collector`'s two `CONFLICT`s). Cases are `[RegExp, copy]` pairs. Anchor a pattern (`^…$`) when the detail is a fixed message. The first match wins.
- **`detail` never reaches a client by default.** It can name internal states (`current: PENDING_HOD`) and is for logs and branching only. A message can carry RPC text only through an explicit override, and `byDetail` maps a matched detail to fixed copy rather than echoing it.
- **`INTERNAL` is always `500 "Internal error. Ref: <ref>"`.** The ref is the one `callRpc` logged with the original error.

---

## 1. Authentication

### POST /api/auth/login

**File**: `src/app/api/auth/login/route.ts`
**Roles**: ALL (unauthenticated)

| Field      | Type             | Required |
| ---------- | ---------------- | -------- |
| `email`    | `string` (email) | yes      |
| `password` | `string`         | yes      |

**Response `data`**:

```json
{ "session": "<jwt>", "role": "VERIFIER", "mfa_required": true }
```

If `mfa_required` is `true`, the client must complete `/api/auth/verify-otp` before the session is usable. Supabase Auth handles OTP delivery.

**Errors**: `401` invalid credentials · `422` schema validation · `503` network connection failed (Supabase connectivity failure — distinguished from invalid credentials via `isAuthRetryableFetchError`, not conflated into a `401`)

---

### POST /api/auth/verify-otp

**File**: `src/app/api/auth/verify-otp/route.ts`
**Roles**: DEAN, VERIFIER, REQUESTER (new device)

| Field   | Type                | Required |
| ------- | ------------------- | -------- |
| `email` | `string` (email)    | yes      |
| `otp`   | `string` (6 digits) | yes      |

**Response `data`**: `{ "session": "<jwt>" }` — full session after MFA.

**Errors**: `401` invalid or expired OTP · `422` schema validation

---

### POST /api/auth/register

**File**: `src/app/api/auth/register/route.ts`
**Roles**: REQUESTER (invite link only)

Completes requester registration. There is no `token` field — the invite link is a Supabase magic link that resolves through `GET /auth/confirm` (below) into a short-lived session in the transient `activate` cookie namespace **before** the browser ever reaches this route; this route just reads that session.

| Field            | Type                                          | Required |
| ---------------- | --------------------------------------------- | -------- |
| `password`       | `string` (min 12, mixed case, number, symbol) | yes      |
| `passport_photo` | `File` (image, max 5MB)                       | yes      |

**Response `data`**: `{ "profile_id": "<uuid>" }`

The photo's type is detected from its bytes (PNG, JPEG or WebP — see "Uploads" under §7a) and stored under that type and extension, never the declared one. It is checked before the password changes.

**Errors**: `401` no valid activation session · `422` password fails the `src/lib/validation/primitives.ts` rule, missing photo, or a photo that is not a PNG/JPEG/WebP ("Passport photo must be a PNG, JPEG or WebP image") · `413` photo over 5MB

---

### POST /api/auth/activate-hod

**File**: `src/app/api/auth/activate-hod/route.ts`
**Roles**: DEAN (invite link only)

One-time Dean onboarding. There is no `token` field — as with `/api/auth/register`, the invite link resolves through `GET /auth/confirm` into a session in the `activate` namespace before this route runs. Sets password, stores signature and stamp references, enables MFA.

| Field       | Type                                          | Required |
| ----------- | --------------------------------------------- | -------- |
| `password`  | `string` (min 12, mixed case, number, symbol) | yes      |
| `signature` | `File` (image)                                | yes      |
| `stamp`     | `File` (image)                                | yes      |

Each image's type is detected from its bytes (PNG, JPEG or WebP) and stored under that type and extension, checked before the plausibility pass and before the password changes.

**Response `data`**: `{ "profile_id": "<uuid>", "redirect": "/dean" }`

**Errors**: `401` no valid activation session · `422` validation, including a signature or stamp that is not a PNG/JPEG/WebP ("Signature image must be a PNG, JPEG or WebP file" / "Stamp image …") · `413` image too large

---

### POST /api/auth/logout

**File**: `src/app/api/auth/logout/route.ts`
**Roles**: ALL

No request body. Invalidates the current Supabase session.

**Response `data`**: `null`

---

### POST /api/auth/reset-password

**File**: `src/app/api/auth/reset-password/route.ts`
**Roles**: ALL (unauthenticated)

| Field   | Type             | Required |
| ------- | ---------------- | -------- |
| `email` | `string` (email) | yes      |

Triggers a Supabase Auth password-reset email via `admin.generateLink({type:'recovery'})`, delivered through `GET /auth/confirm` (below) — not the raw `action_link` from `generateLink`, and not `GET /api/auth/callback`. Always returns 200 (no email enumeration).

**Response `data`**: `null`

---

### GET /auth/confirm

**File**: `src/app/(public)/auth/confirm/route.ts`
**Roles**: ALL (unauthenticated)

Not a JSON API route — a redirect handler, and the actual session-establishment mechanism for every emailed one-time link the app generates: invite (`POST /api/admin/users`), re-invite (`POST /api/admin/users/[id]/resend-invite`), and password reset (`POST /api/auth/reset-password`). Each of those routes calls `admin.generateLink()` and builds a link here from the response's `hashed_token` + `verification_type`, e.g. `?token_hash=...&type=recovery&next=/reset-password`. This route calls `verifyOtp({type, token_hash})` server-side — no PKCE `code_verifier` involved, which matters because the link is minted by the admin API, not by a browser that could have stored one. Session lands in the transient `activate` cookie namespace, then redirects to `next` (defaults to `/`).

On failure: `type=recovery` redirects to `/reset-password?error=expired`; everything else redirects to `/login?error=invalid-link`.

**Response**: HTTP redirect, not a JSON envelope.

---

### GET /api/auth/callback

**File**: `src/app/api/auth/callback/route.ts`
**Roles**: ALL (unauthenticated)

Not a JSON API route — a redirect handler for the PKCE `?code=...&next=...` shape (`exchangeCodeForSession`), landing in the same transient `activate` namespace as `/auth/confirm` on success, and `/forgot-password?error=expired` on failure. **Not used by any in-app flow** — invite, re-invite, and password reset all route through `GET /auth/confirm` instead, because `exchangeCodeForSession` requires a `code_verifier` cookie that only exists in a browser that itself initiated the flow, which is never true for an admin-generated link. Retained only as a dead-but-harmless fallback in case a Supabase-configured redirect (e.g. the dashboard's default templates) ever points here.

**Response**: HTTP redirect, not a JSON envelope.

---

### POST /api/auth/resend-otp

**File**: `src/app/api/auth/resend-otp/route.ts`
**Roles**: ALL (unauthenticated — email-based, pre-session)

| Field   | Type             | Required |
| ------- | ---------------- | -------- |
| `email` | `string` (email) | yes      |

Re-sends the login MFA code for a known `institutional_email`, storing a fresh hashed code + 10-minute expiry in the user's `app_metadata`. Always returns 200 regardless of whether the email matches a profile (no enumeration) — mirrors `/api/auth/reset-password`'s pattern.

**Response `data`**: `null`

---

### POST /api/auth/change-password

**File**: `src/app/api/auth/change-password/route.ts`
**Roles**: ALL (authenticated)

| Field              | Type     | Required |
| ------------------ | -------- | -------- |
| `current_password` | `string` | yes      |
| `new_password`     | `string` | yes      |

Verifies `current_password` by re-authenticating (`signInWithPassword`) before applying the change. Writes a `PASSWORD_CHANGED` audit entry.

**Response `data`**: `null`

**Errors**: `401` not authenticated or current password incorrect · `422` validation

---

## 2. Requests

### POST /api/requests/submit

**File**: `src/app/api/requests/submit/route.ts`
**Roles**: REQUESTER
**RPC**: `create_request(requester_id, key_id, type, return_deadline, weekend_date?, risk_tier?, risk_factors?, letter_url?, stamp_url?)` — service-only, called through the admin client with the session user as `requester_id`

| Field             | Type                       | Required                                                                                                                                                                   |
| ----------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `key_id`          | `string` (uuid)            | yes                                                                                                                                                                        |
| `type`            | `'WEEKDAY' \| 'WEEKEND'`   | yes                                                                                                                                                                        |
| `return_deadline` | `string` (ISO timestamptz) | yes                                                                                                                                                                        |
| `weekend_date`    | `string` (ISO date)        | WEEKEND only                                                                                                                                                               |
| `letter_url`      | `string`                   | no — optional Dean-signature image the requester uploaded client-side to `weekend-letters`; persisted on the request row for later signature verification at Dean approval |
| `stamp_url`       | `string`                   | no — optional stamp close-up, same rules as `letter_url`                                                                                                                   |

The route runs the risk engine and passes the result to the RPC, which writes the request (with `risk_tier`, `risk_factors` and, for a weekend request, `letter_url`/`stamp_url`), the code and the `REQUEST_CREATED` entry (carrying the tier) in one transaction. Until 2026-10-13 the tier and the letter/stamp were back-filled after the RPC by two best-effort admin-client UPDATEs, so a failure could leave a HIGH-risk request stored as LOW. A `letter_url`/`stamp_url` outside the requester's own `weekend-letters/{uid}/` folder is refused (`422`) by the route and again by the RPC; on a weekday request the route drops them. The browser uploads these straight to Storage, so no route sees the bytes at upload time; since 2026-10-14 the route reads each stored object back (service role) and refuses one that is not a PNG, JPEG or WebP — or that is missing — with the same `422 Invalid letter or stamp upload`, before `create_request` runs.

Since 2026-10-15 `create_request` is executable by `service_role` only, and the route calls it through the admin client, passing the server-verified `user.id` as `p_requester_id`. Before, the RPC was granted to `authenticated`, so a requester could call it with a session and store any risk tier (and an RLS INSERT policy let them insert a request row directly); both are closed by `20261015090000_grant_hardening.sql`.

**Response `data`** (WEEKDAY):

```json
{
  "request_id": "<uuid>",
  "code": "123456",
  "code_expires_at": "<iso>",
  "risk_tier": "LOW"
}
```

**Response `data`** (WEEKEND — no code yet; status starts `PENDING_HOD`, awaiting Dean/CSO decision):

```json
{
  "request_id": "<uuid>",
  "status": "PENDING_HOD",
  "risk_tier": "LOW"
}
```

**Errors**: `403` requester not authorised for this key · `409` active request already exists for this key · `409` no key available for this room (`NO_KEYS_AVAILABLE`) · `422` a `WEEKEND` request without a `weekend_date`, or one that is not a Saturday/Sunday from today onwards (Lagos date; checked since 2026-10-13 — previously a missing date booked the request for today, whatever day that was) · `422` outside operational hours (weekend requests) · `500` RPC failure

The two `409`s are distinct and the route maps them to different messages. `CONFLICT` means **you** already have an active request for this key; `NO_KEYS_AVAILABLE` means every copy of the room's key is out or reserved by other people, so telling this requester to cancel something would point them at a request they never made. The latter is raised by the `requests_key_capacity` trigger (`docs/DATABASE.md`) and only on the `WEEKDAY` branch, which mints a code immediately — a `WEEKEND` request starts `PENDING_HOD` and reserves nothing.

After the response, sends a request notification through `notifyAfterResponse` (`src/lib/notifications/`): `CODE_ISSUED` for a `WEEKDAY` request (the collection code), `WEEKEND_SUBMITTED` for a `WEEKEND` request — to the key's unit's Dean, or to every active CSO for an Administration (`authoriser='CSO'`) key, each subject to their `weekend_submitted_email` preference. For a Dean-routed weekend request, `create_request` itself sets `decision_token` in the same transaction as the insert, and the Dean's email links to `/dean-decision/[token]` — the one-click Approve/Decline flow (see "Public one-click Dean decision" below). No send can fail the response.

---

### GET /api/requests/my

**File**: `src/app/api/requests/my/route.ts`
**Roles**: REQUESTER

**Query params**: `status` (optional, comma-separated `request_status` values) · `limit` (positive integer, default 20, values above 50 clamp to 50) · `cursor` (the opaque `next_cursor` from a previous page: base64 of a `created_at` timestamp)

**Response `data`**: `{ "requests": [...], "next_cursor": "<opaque>" }`

**Errors**: `422 Invalid query parameters` for a non-integer or non-positive `limit`, an unknown `status`, or a `cursor` that does not decode to a timestamp (since 2026-10-15; these used to reach Postgres and answer `500`) · `500` query failure, with a correlation reference

---

### GET /api/requests/pending

**File**: `src/app/api/requests/pending/route.ts`
**Roles**: DEAN, CSO

Returns requests for the Dean's faculty with `status = 'PENDING_HOD'`, including external (guest) requests for the faculty (joined `guest` details, `letter_url`, `requested_unit_id`) so the Dean can review and assign a key before approving. The CSO may also call this route — it returns Administration-routed pending requests for CSO review (`authoriser='CSO'` units have no Dean).

**Response `data`**: `{ "requests": [...] }`

---

### POST /api/requests/hod-decision

**File**: `src/app/api/requests/hod-decision/route.ts`
**Roles**: Dean (role: DEAN), CSO
**RPC**: `approve_weekend(request_id, hod_id, note?, signature_verified?, signature_mismatch_pct?, cso_override?)`, `approve_guest_weekend(request_id, hod_id, key_id, note?)`, or `decline_weekend(request_id, hod_id, note?, cso_override?)` — all three service-only since 2026-10-15; `decideWeekend` calls them through the admin client with the session user (or, on the one-click page, the unit's current Dean) as `hod_id`

| Field        | Type                       | Required             |
| ------------ | -------------------------- | -------------------- |
| `request_id` | `string` (uuid)            | yes                  |
| `decision`   | `'APPROVED' \| 'DECLINED'` | yes                  |
| `key_id`     | `string` (uuid)            | guest approvals only |
| `note`       | `string`                   | no                   |

The route identifies the actor from the session and hands off to the Weekend decision module (`decideWeekend` in `src/lib/requests/decide-weekend.ts`), which derives everything else from the request row and the actor's profile. The client does **not** say which images to verify or whether the CSO is overriding — those fields (`submitted_signature_url`, `submitted_stamp_url`, `cso_override`) were removed 2026-10-12 because they let the browser choose the image under test or skip the check entirely. Zod strips them if a stale client still sends them.

For a Dean approving a registered request, the module pixel-verifies the request's own stored `letter_url` (against `signature_ref_url`) and `stamp_url` (against `stamp_ref_url`) — independent checks; either, both, or neither may run (see `docs/AI.md` §3). A stored URL that is not an object in `weekend-letters` is refused (`422`) rather than compared. If **either** check fails its threshold, the approval is **held** — the RPC is never called — and a `SIGNATURE_MISMATCH` audit entry is written instead, carrying canonical storage URLs and the actor's role, with a nested payload `{ signature: {ref_url, submitted_url, mismatch_pct} | null, stamp: {...} | null, threshold_pct }`. The response in this case is `{ "request_id": "<uuid>", "status": "HELD_SIGNATURE_MISMATCH", "mismatches": { "signature"?: <number>, "stamp"?: <number> } }` (still HTTP 200 — this is not a route-level error; only the failing check(s) appear in `mismatches`). If that audit entry cannot be written the route returns `500` instead — the entry is the hold. Alongside it, every `ACTIVE` CSO opted in to `notification_preferences.signature_mismatch_email` (default true) is emailed (after the response; a send failure is logged, never surfaces to the Dean's response). With no letter or stamp attached, the approval proceeds and `hod_decisions.signature_verified` is recorded as `false`.

For an external (guest) request, the route requires a `key_id` in the body and the module calls `approve_guest_weekend` instead — the Dean assigns the key at approval, and both checks are skipped (guests have no Dean reference signature or stamp; the Dean reviews the uploaded letter manually). The decline path reuses `decline_weekend` unchanged.

The **CSO** may call this route for **Administration** requests (keys whose unit `authoriser = 'CSO'`). The CSO path skips signature verification (no reference signature exists for the CSO) and records `signature_verified = false`. The RPC re-validates that the actor's role matches the target unit's `authoriser`, so a Dean acting on an Administration key is rejected with `403`.

The CSO acting on a **Dean-authorised** request is always treated as resolving a **held mismatch** — the module passes `p_cso_override` itself. The RPC only honours it when a `SIGNATURE_MISMATCH` audit entry already exists for the request, so it is not a general bypass of the Dean-authoriser gate; without one the CSO gets `403`. See `GET /api/ai/signature-alerts` for how the CSO discovers these.

**Response `data`**: `{ "request_id": "<uuid>", "status": "APPROVED" | "DECLINED" | "HELD_SIGNATURE_MISMATCH" }` — note this is `"APPROVED"`/`"DECLINED"` (the `hod_decisions.decision` / request status the RPC actually sets), not `"CODE_ISSUED"` — no code is minted at Dean-decision time; the requester mints one later via `POST /api/requests/weekend-code`.

**Errors**: `403` not the request's authoriser, the CSO acting on a Dean-authorised request with no held mismatch, or the Dean has no reference signature on file · `404` request not found · `409` already decided, or the requested date has passed · `422` validation, missing guest `key_id`, or a stored letter/stamp that is not a `weekend-letters` object · `500` with a correlation reference

---

### GET /api/requests/cso-queue

**File**: `src/app/api/requests/cso-queue/route.ts`
**Roles**: CSO

Returns requests with `risk_tier = 'HIGH'` and `status` in `('CODE_ISSUED', 'KEY_ISSUED')`. There is no `PENDING_CSO` status in the schema — high-risk requests are not held for a separate CSO approval step before collection; this queue is a review/intervention surface over requests that are already issuable or issued, not a gate in front of `hod-decision`. It does not filter on a restricted-zone flag specifically (that's folded into `risk_tier` by the risk engine).

**Response `data`**: `{ "requests": [...] }`

---

### POST /api/requests/cso-decision

**File**: `src/app/api/requests/cso-decision/route.ts`
**Roles**: CSO

**RPC**: `cso_decide_request(request_id, decision, note?)`

CSO intervention on a high-risk request surfaced by `cso-queue` above — not an approval gate every request passes through. `decision: 'DECLINED'` withdraws an uncollected code (`CODE_ISSUED` → `CANCELLED`, audit `REQUEST_DECLINED_CSO`); `decision: 'APPROVED'` makes no state change (an acknowledgement that the CSO has reviewed it and is letting it proceed), audit `REQUEST_APPROVED_CSO`. The state change, the note and the audit entry commit together in the RPC.

Until 2026-10-13 a decline on a `KEY_ISSUED` request (the queue shows those too) changed nothing but still wrote `REQUEST_DECLINED_CSO` and answered `CANCELLED`; it is now a `409`. The note used to be dropped.

| Field        | Type                       | Required                                 |
| ------------ | -------------------------- | ---------------------------------------- |
| `request_id` | `string` (uuid)            | yes                                      |
| `decision`   | `'APPROVED' \| 'DECLINED'` | yes                                      |
| `note`       | `string`                   | no — recorded in the audit entry payload |

**Response `data`**: `{ "request_id": "<uuid>", "status": "CANCELLED" | "CODE_ISSUED" | "KEY_ISSUED" }` (`CANCELLED` on decline; on approve, the request's real, unchanged status)

**Errors**: `401` unauthenticated · `403` not CSO · `404` request not found · `409` declining anything but an uncollected code, or approving a request no longer `CODE_ISSUED`/`KEY_ISSUED` · `422` validation

---

### GET /api/requests/live-queue

**File**: `src/app/api/requests/live-queue/route.ts`
**Roles**: VERIFIER

Returns all requests with `status = 'CODE_ISSUED'`, ordered by `created_at` ascending. This is the initial load for the verifier dashboard; ongoing updates come via Supabase Realtime.

**Query params**: `id` (optional). With `id`, returns just that request — `{ "request": {...} }`, or `{ "request": null }` when it is no longer `CODE_ISSUED` or does not exist. The Realtime INSERT handler uses this and drops a `null`. A malformed (non-uuid) `id` answers `{ "request": null }` without querying, exactly like an unknown one (since 2026-10-15; it used to reach Postgres and answer `500`).

**Response `data`**: `{ "requests": [...] }`, or `{ "request": {...} | null }` with `id`

---

### POST /api/requests/collect

**File**: `src/app/api/requests/collect/route.ts`
**Roles**: VERIFIER
**RPC**: `issue_key(request_id, verifier_id)` — since 2026-10-15 the RPC itself refuses a `verifier_id` that is not the session user, or not a `VERIFIER` (`FORBIDDEN` → the catalogue default)

| Field  | Type                | Required |
| ------ | ------------------- | -------- |
| `code` | `string` (6 digits) | yes      |

`verifier_id` is **not** a request field — the route derives it from the server-verified session (`user.id`), never a client-supplied value, so a verifier can't attribute a collection to someone else's session.

The RPC looks up the request by code, validates it, marks the key issued, clears the code, and writes the audit entry.

The response carries an `is_guest` flag. For an external (guest) request it is `true` and the `requester` block carries the declared ID document (type + number) with a null `photo_url` — the verifier checks the physical ID at the desk. The shape is additive, so registered-requester consumers are unaffected.

**Response `data`** (registered requester):

```json
{
  "request_id": "<uuid>",
  "is_guest": false,
  "requester": { "full_name": "Dr. Bakare", "photo_url": "<url>" },
  "key": { "code": "NS-304", "room_name": "Senate Hall A" },
  "issued_at": "<iso>"
}
```

**Response `data`** (external guest):

```json
{
  "request_id": "<uuid>",
  "is_guest": true,
  "requester": {
    "full_name": "Jane Doe",
    "photo_url": null,
    "id_document_type": "National ID",
    "id_document_number": "A1234567"
  },
  "key": { "code": "NS-304", "room_name": "Senate Hall A" },
  "issued_at": "<iso>"
}
```

**Errors**: `404` code not found or expired · `409` key already issued, every copy already out, or no copy available (`NO_KEYS_AVAILABLE`) · `422` validation

The capacity `409` is raised by the `issue_key` capacity guard (see `docs/DATABASE.md`) when the room's copies are all already out — `count(KEY_ISSUED for this key) >= keys.key_count`. In practice it is unreachable through normal paths, because a request only reaches `CODE_ISSUED` by passing the `requests_key_capacity` trigger, which already reserved a copy; it is defence in depth at the physical handover. Unlike any other route, `collect` passes that `CONFLICT`'s own text through to the client, so the verifier sees **"this key is already issued and has not been returned"** (single-copy rooms) or **"all N keys on this bunch are out and none has been returned"** verbatim. Those two messages are therefore UI copy. They pass only on an exact, anchored match (`VERIFIER_FACING_CONFLICTS` in the route); any other `CONFLICT` detail — such as the request having left `CODE_ISSUED` between lookup and issue — gets the fixed copy "This code has already been used." Until 2026-10-13 the route passed through `msg.split(': ')[1]` for every `CONFLICT`, which truncated a detail with a second `': '` mid-clause and leaked internal state ("request is not in CODE_ISSUED state (current"), and `NO_KEYS_AVAILABLE` was unmapped and came back as a `500`.

---

### POST /api/requests/cancel

**File**: `src/app/api/requests/cancel/route.ts`
**Roles**: REQUESTER
**RPC**: `cancel_request(request_id)`

| Field        | Type            | Required |
| ------------ | --------------- | -------- |
| `request_id` | `string` (uuid) | yes      |

Cancellable from any pre-collection state the requester owns: `CODE_ISSUED` (weekday code), or `PENDING_HOD` / `APPROVED` (a weekend request before its on-the-day code is minted — the manual escape hatch for an approved weekend request whose date passes). The RPC cancels, clears the code and writes `REQUEST_CANCELLED` in one transaction; the requester is the session user.

**Response `data`**: `{ "request_id": "<uuid>", "status": "CANCELLED" }`

**Errors**: `404` request not found, including another requester's request (its existence is not disclosed) · `409` request not in cancellable state

---

### Request lifecycle steps (registered and guest)

Three steps a holder takes on their own request exist as a registered route and a guest route: the collection code (`weekend-code` / `[token]/code`), the return code (`request-return` / `[token]/return-code`) and code expiry (`expire` / `[token]/expire`). Since 2026-10-19 each pair goes through one function in the Request lifecycle module, `src/lib/requests/lifecycle.ts` — `generateCollectionCode`, `generateReturnCode`, `expireCollectionCode`. A route builds a `LifecycleTarget` (`{ kind: 'registered', requestId, requesterId: user.id }`, or `{ kind: 'guest', accessToken }` with the admin client) and shapes the response; the module calls the RPC, maps its errors and, for the collection code, sends the `CODE_ISSUED` email. Below the module, each RPC pair is a thin wrapper around one SQL implementation (`docs/DATABASE.md`), so both paths raise the same kinds for the same state, and the module gives each kind the same copy:

| Kind                | Status | Copy (both routes)                                                    | Steps                    |
| ------------------- | ------ | --------------------------------------------------------------------- | ------------------------ |
| `NOT_AUTHENTICATED` | 401    | Not authenticated                                                     | all (registered only)    |
| `FORBIDDEN`         | 403    | This is not your request                                              | all (registered only)    |
| `NOT_FOUND`         | 404    | Request not found                                                     | all                      |
| `CONFLICT`          | 409    | This request is not approved for collection.                          | collection code          |
| `NO_KEYS_AVAILABLE` | 409    | catalogue default                                                     | collection code          |
| `TOO_EARLY`         | 422    | catalogue default                                                     | collection code          |
| `NOT_ISSUED`        | 409    | This key is not currently issued to you                               | return code              |
| `NOT_EXPIRED`       | 409    | This code has not expired yet. (catalogue default)                    | expire                   |

Until 2026-10-19 the copies differed: the registered collection-code `409` said "This request is not awaiting collection.", the guest return-code route said "Key is not currently issued." (and its `404`s "Request not found." with a full stop), and the guest expire `409` said "The code has not expired yet." Every status code is unchanged. The response shapes are unchanged too, including the guest return-code response, which has never carried `request_id`.

---

### POST /api/requests/request-return

**File**: `src/app/api/requests/request-return/route.ts`
**Roles**: REQUESTER
**RPC**: `request_return(request_id, requester_id)`, via `generateReturnCode` (see "Request lifecycle steps" above)

Requester-initiated. Generates a 6-digit **return code** (15-minute expiry) for one of the requester's own keys that is currently issued, so the verifier can confirm the handover. The request stays in `KEY_ISSUED`; the code is written to `requests.return_code` / `return_code_expires_at`. Writes a `RETURN_CODE_GENERATED` audit entry.

| Field        | Type            | Required |
| ------------ | --------------- | -------- |
| `request_id` | `string` (uuid) | yes      |

**Response `data`**: `{ "request_id": "<uuid>", "return_code": "123456", "return_code_expires_at": "<iso>" }`

**Errors**: `403` not the requester's own request · `409` key not currently issued · `404` request not found

---

### POST /api/requests/weekend-code

**File**: `src/app/api/requests/weekend-code/route.ts`
**Roles**: REQUESTER
**RPC**: `generate_weekend_code(request_id, requester_id)`, via `generateCollectionCode` (see "Request lifecycle steps" above)

Requester-initiated. For an `APPROVED` weekend request, on the requested date only, mints a short-lived 6-digit collection code (10-min expiry) and moves the request to `CODE_ISSUED` — mirroring the weekday flow so the code is never long-lived. Writes a `CODE_ISSUED` audit entry.

| Field        | Type            | Required |
| ------------ | --------------- | -------- |
| `request_id` | `string` (uuid) | yes      |

**Response `data`**: `{ "request_id": "<uuid>", "code": "123456", "code_expires_at": "<iso>" }`

**Errors**: `403` not the requester's own request · `409` request not in APPROVED state · `409` no key available for this room (`NO_KEYS_AVAILABLE` — minting the code is what reserves a copy, so an approved weekend request can find the room fully spoken for on the day) · `422` before the requested date (TOO_EARLY) · `404` request not found

---

### POST /api/requests/expire

**File**: `src/app/api/requests/expire/route.ts`
**Roles**: REQUESTER
**RPC**: `expire_request(request_id, requester_id)`, via `expireCollectionCode` (see "Request lifecycle steps" above)

Requester-initiated and fired automatically by the UI when a collection code's countdown reaches 0. Flips a genuinely-expired `CODE_ISSUED` request to `EXPIRED`, clears the code, and writes a `REQUEST_EXPIRED` audit entry — **except** for a weekend request whose requested date is today, which instead rolls back to `APPROVED` (so the requester can mint a fresh code via `POST /api/requests/weekend-code`) and writes `CODE_EXPIRED` instead. Idempotent — returns the current status with no error if the request already moved on.

| Field        | Type            | Required |
| ------------ | --------------- | -------- |
| `request_id` | `string` (uuid) | yes      |

**Response `data`**: `{ "request_id": "<uuid>", "status": "EXPIRED" }` (or `"APPROVED"` on the same-day weekend rollback above)

**Errors**: `403` not the requester's own request · `409` code has not expired yet · `404` request not found

---

### POST /api/requests/dismiss

**File**: `src/app/api/requests/dismiss/route.ts`
**Roles**: DEAN, CSO
**RPC**: `dismiss_expired_request(request_id, actor_id)`

Clears a lapsed weekend request out of the authoriser's pending queue. A request whose `requested_for` date has passed can no longer be approved or declined (both RPCs refuse a past date), so without this it sits in the Dean's or CSO's list until the nightly `expire_stale_weekend_requests()` sweep runs.

This is housekeeping, not a decision on merits — no `hod_decisions` row is written. The request moves to `EXPIRED`, the same terminal state the cron produces, so it stays visible in the requester's history and the CSO audit log. The `REQUEST_EXPIRED` audit payload carries `reason: 'dismissed_by_authoriser'`, the previous status, and the dismissing actor.

A Dean may dismiss requests routed to their own faculty; the CSO may dismiss any, including Administration ones. The RPC re-validates both the authoriser gate and that the date has genuinely passed, so the route-level role check is defence-in-depth only.

| Field        | Type            | Required |
| ------------ | --------------- | -------- |
| `request_id` | `string` (uuid) | yes      |

**Response `data`**: `{ "request_id": "<uuid>", "status": "EXPIRED" }`

**Errors**: `403` not a Dean/CSO, or request not in your faculty · `404` request not found · `409` request still live (approve or decline it instead), or not in a dismissable state · `422` validation

---

### Public (external/guest) weekend requests

These routes let an external person with no SmartKey account submit a weekend key request and reach their session-less status/code page. They require **no authentication** and run server-side via the service-role admin client (`createAdminClient`); the guest RPCs are revoked from `anon`/`public`, so nothing new is exposed to the browser. The guest is identified throughout by the unguessable `access_token` returned at submit.

All five are wrapped in `route({ auth: 'public' })`, which gives them no Supabase client: each handler creates the admin client itself. A malformed token is rejected by the `params` schema before any query runs, with the route's own `404` copy. RPC errors map through `rpcFail`, so an unrecognised failure is a `500` with a ref and the RPC's text never reaches the guest. Until 2026-10-13 an uncaught throw (for example a misconfigured service-role key) escaped as Next's bare, unenveloped `500`; it is now `500 "Internal error. Ref: <ref>"` like every other failure.

#### POST /api/public/weekend-request

**File**: `src/app/api/public/weekend-request/route.ts`
**Roles**: ALL (unauthenticated)
**RPC**: `create_guest_weekend_request(full_name, email, phone, id_type, id_number, department_id, weekend_date, return_deadline, letter_url, requested_room)`

Multipart form. Uploads the Dean authorisation letter to the `weekend-letters` bucket and creates the guest + request (`PENDING_HOD`, no code). For a Dean-authorised unit, `create_guest_weekend_request` sets `decision_token` in the same transaction. After the response, two notifications go out through `notifyAfterResponse` (`src/lib/notifications/`): `GUEST_SUBMISSION_RECEIVED` emails the guest their status link, and `WEEKEND_SUBMITTED` emails the unit's Dean — with the "External" badge and the one-click `/dean-decision/[token]` link, where approving also requires picking a key — or every active CSO for an Administration unit. No send can fail the request. Returns `201`.

| Field                | Type                        | Required |
| -------------------- | --------------------------- | -------- |
| `full_name`          | `string` (trimmed, max 120) | yes      |
| `email`              | `string` (email)            | yes      |
| `phone`              | `string`                    | no       |
| `id_document_type`   | `string`                    | yes      |
| `id_document_number` | `string`                    | yes      |
| `department_id`      | `string` (uuid)             | yes      |
| `requested_room`     | `string` (max 200)          | yes      |
| `weekend_date`       | `string` (ISO date)         | yes      |
| `return_deadline`    | `string` (ISO timestamptz)  | yes      |
| `letter`             | `File` (image/PDF)          | yes      |

**Response `data`**: `{ "access_token": "<uuid>", "request_id": "<uuid>" }`

The letter's type is detected from its bytes — PNG, JPEG, WebP or PDF — and it is stored as `guest/{uuid}.{ext}` under that type, never the declared one (a file labelled `application/pdf` that is really SVG or HTML is refused). `full_name` is at most 120 characters (200 until 2026-10-14).

**Rate limit** (since 2026-10-19). The route needs no login, and each accepted submission stores a row pair and a letter of up to 5 MB and sends two emails, so it is limited per client and per guest:

| Limit    | Key                                                                                             | Constant                           |
| -------- | ----------------------------------------------------------------------------------------------- | ---------------------------------- |
| 5 / hour | client address: first `x-forwarded-for` hop (Vercel sets it), else `x-real-ip`; IPv6 by its /64 | `GUEST_SUBMISSION_LIMITS.perIp`    |
| 3 / day  | the guest email, trimmed and lower-cased                                                        | `GUEST_SUBMISSION_LIMITS.perEmail` |

Both live in `src/lib/http/rate-limit.ts`. The check runs after every validation above and before the upload, so a form that fails validation does not count and a refused one stores and sends nothing. The count is kept in Postgres by the service-only `check_rate_limit` RPC (`docs/DATABASE.md`), because serverless instances share no memory. Keys are HMAC-SHA-256 digests under the `RATE_LIMIT_SALT` env var; no raw address or email is stored. Over either limit → `429` with a `Retry-After` header (seconds) and the message "You have sent several requests in a short time. Please wait about N minutes and try again. If your access is urgent, contact the Senate Building security desk." The guest form shows it as a notice rather than an error.

The limiter **fails open**: with `RATE_LIMIT_SALT` unset it is skipped and `rate-limit: RATE_LIMIT_SALT is not set…` is logged as a warning on every submission; if the RPC errors (for example before the migration is applied) the submission goes through and the error is logged. A misconfiguration must not stop every guest from requesting weekend access, and every request still needs a Dean's or the CSO's approval. With no client address at all, only the email limit applies.

**Errors**: `404` department not found · `422` validation, a letter that is not an image or PDF, or `weekend_date` is not a Saturday/Sunday from today onwards (Lagos date) · `413` letter too large · `429` rate limited (`Retry-After` set)

---

#### GET /api/public/weekend-request/[token]

**File**: `src/app/api/public/weekend-request/[token]/route.ts`
**Roles**: ALL (unauthenticated)

Returns safe status fields for the guest's status/code page, read by `access_token` via the admin client: current status, requested date, the room the guest stated they need, the assigned key/room once present, and the code + expiry while `CODE_ISSUED`.

**Response `data`**:

```json
{
  "request_id": "<uuid>",
  "full_name": "Jane Doe",
  "status": "APPROVED",
  "requested_for": "2026-06-20",
  "return_deadline": "<iso>",
  "requested_room": "Senate Hall A",
  "key": { "code": "NS-304", "room_name": "Senate Hall A" },
  "code": null,
  "code_expires_at": null
}
```

`code` / `code_expires_at` are non-null only while `status = 'CODE_ISSUED'`; `key` is null until the Dean assigns one on approval.

**Errors**: `404` token not found

---

#### POST /api/public/weekend-request/[token]/code

**File**: `src/app/api/public/weekend-request/[token]/code/route.ts`
**Roles**: ALL (unauthenticated)
**RPC**: `generate_guest_weekend_code(access_token)`, via `generateCollectionCode` (see "Request lifecycle steps" under §2)

Mints a short-lived 6-digit collection code (10-min expiry) for an `APPROVED` guest request, on the requested date only, and moves it to `CODE_ISSUED`. Writes a `CODE_ISSUED` audit entry.

**Response `data`**: `{ "request_id": "<uuid>", "code": "123456", "code_expires_at": "<iso>" }`

**Errors**: `409` request not in APPROVED state · `409` no key available for this room (`NO_KEYS_AVAILABLE`, same reason as the registered flow above) · `422` before the requested date (TOO_EARLY) · `404` token not found

---

#### POST /api/public/weekend-request/[token]/return-code

**File**: `src/app/api/public/weekend-request/[token]/return-code/route.ts`
**Roles**: ALL (unauthenticated)
**RPC**: `request_return_guest(access_token)`, via `generateReturnCode` (see "Request lifecycle steps" under §2)

Guest analogue of `POST /api/requests/request-return`. Generates a 6-digit return code (15-minute expiry) for the guest's own `KEY_ISSUED` request so the verifier can confirm the handover. The request stays in `KEY_ISSUED`; the code is written to `requests.return_code` / `return_code_expires_at`. Writes a `RETURN_CODE_GENERATED` audit entry.

No request body.

**Response `data`**: `{ "return_code": "123456", "return_code_expires_at": "<iso>" }`

**Errors**: `404` token not found, or malformed (`Request not found`; until 2026-10-19 `Request not found.`) · `409` key not currently issued (`NOT_ISSUED` since 2026-10-19 — the RPC raised `CONFLICT` before; the status was `409` either way)

---

#### POST /api/public/weekend-request/[token]/expire

**File**: `src/app/api/public/weekend-request/[token]/expire/route.ts`
**Roles**: ALL (unauthenticated)
**RPC**: `expire_guest_request(access_token)`, via `expireCollectionCode` (see "Request lifecycle steps" under §2)

Fired automatically by the status page when the collection code's countdown reaches 0. Flips a genuinely-expired `CODE_ISSUED` request to `EXPIRED`, clears the code, and writes a `REQUEST_EXPIRED` audit entry — **except** for a weekend request whose requested date is today, which instead rolls back to `APPROVED` (so the guest can mint a fresh code) and writes `CODE_EXPIRED` instead. Idempotent — returns the current status with no error if the request already moved on.

**Response `data`**: `{ "request_id": "<uuid>", "status": "EXPIRED" }` (or `"APPROVED"` on the same-day weekend rollback above)

**Errors**: `409` code has not expired yet · `404` token not found

---

### GET /api/requests/[id]/letter

**File**: `src/app/api/requests/[id]/letter/route.ts`
**Roles**: DEAN, CSO

Returns a short-lived (5-minute) signed URL for a request's uploaded authorisation letter or stamp image, so the authoriser can preview it before deciding. The file lives in the private `weekend-letters` bucket; signing happens server-side with the admin client.

Scope, enforced by the route itself (since 2026-10-15) and not left to RLS:

- **Dean** — reads through their session (RLS), then the route requires every unit governing the request — the key's unit for a registered request, `requested_unit_id` for a guest, both when both are set — to be the Dean's own. A Dean with no unit, or a request resolving to no unit, is refused. Until 2026-10-15 the unit check ran only for guest requests; registered requests relied on RLS alone.
- **CSO** — reads with the admin client (its RLS policy does not cover every request type), so the route bounds it: a request governed by an Administration (`authoriser = 'CSO'`) unit, **or** a Dean-authorised request with a `SIGNATURE_MISMATCH` audit entry — the held approvals the CSO resolves in the Dean's place, the same condition `approve_weekend`'s `cso_override` requires. Until 2026-10-15 the CSO could sign any request's letter. In practice the only CSO caller is `/cso/weekend-requests`, which lists Administration requests; the dashboard's mismatch dialog reads the submitted image through `GET /api/storage/object` instead.

The scope check runs before the file lookup, so a `404` never tells a caller outside the scope whether a letter exists.

The stored `letter_url`/`stamp_url` is parsed with `parseStorageUrl` (`src/lib/storage/object-url.ts`). Anything that is not a well-formed `weekend-letters` object — another bucket, a nested path, or a URL that merely contains `/weekend-letters/` somewhere — is a bad row: logged and answered with a ref'd `500`, never signed. (The route used to find the path with `indexOf('/weekend-letters/')`.)

**Path params**: `id` — a non-uuid id answers the same `404` as an unknown one, without querying.

**Query params**: `type` (`'letter' | 'stamp'`, default `'letter'`) — selects `letter_url` or `stamp_url` on the request row. Any other value → `422 Invalid query parameters` (it used to fall back to `'letter'`).

**Response `data`**: `{ "url": "<signed-url>" }`

**Errors**: `403` not a Dean/CSO, or outside the scope above · `404` unknown or malformed request id, or no letter/stamp for the requested `type` (`Letter not found` / `Stamp not found`) · `422` unknown `type` · `500` with a correlation reference: query, mismatch-lookup or signing failure, or a stored URL that is not a `weekend-letters` object

---

### Public one-click Dean decision (email Approve/Decline)

Lets a Dean act on a Dean-authorised weekend request straight from the "New weekend request" email — no login. Covers both **registered-requester** and **guest (external)** requests. Reuses the same Weekend decision module (`decideWeekend`) as `POST /api/requests/hod-decision` (`src/lib/requests/decide-weekend.ts`), so verification, mismatch-holding, guest key-assignment, the CSO mismatch email, and the requester notification all behave identically to the dashboard flow. Scoped to Dean-authorised units only — Administration/CSO-routed requests (no submission email exists for those today) never receive a `decision_token` and so 404 here.

The email itself distinguishes the two: a guest submission renders a small cyan "External" badge next to the requester's name (`weekendSubmittedEmail`'s `isGuest` param, `src/lib/email/templates/request.ts`), matching the `GuestBadge` treatment already used on the CSO/Dean dashboards and on the confirmation page below.

Both methods are wrapped in `route({ auth: 'public' })` and create the admin client in the handler; the token is validated by a `params` schema (`404 Request not found` when malformed), checked before the `POST` body. Since 2026-10-13 an uncaught throw, including one from `decideWeekend`, is an enveloped `500` with a ref instead of Next's bare `500`.

Security note: `GET` is strictly read-only. It must never mutate state — mail scanners (Outlook Safe Links, Gmail, etc.) prefetch every link in an email, so if a page load could decide the request, the scanner itself would silently approve or decline it before a human opened the email. The actual decision only happens on `POST`, triggered by an explicit button click on `/dean-decision/[token]`.

#### GET /api/public/dean-decision/[token]

**File**: `src/app/api/public/dean-decision/[token]/route.ts`
**Roles**: ALL (unauthenticated)

Read-only. Looks up the request by `decision_token` (admin client) and returns the fields the confirmation page needs, including short-lived (5-minute) signed URLs for the letter/stamp if present (same signing approach as `GET /api/requests/[id]/letter`). For a guest request that's still `PENDING_HOD`, also returns `available_keys` — every non-`RETIRED` key in the requested unit (same filter the dashboard's guest key-picker uses) — so the confirmation page can render a picker.

**Response `data`** (registered requester):

```json
{
  "request_id": "<uuid>",
  "status": "PENDING_HOD",
  "decidable": true,
  "is_guest": false,
  "requested_for": "2026-08-22",
  "requester_name": "Dr. Bakare",
  "requested_room": null,
  "id_document_type": null,
  "id_document_number": null,
  "key": { "code": "NS-304", "room_name": "Senate Hall A" },
  "available_keys": [],
  "letter_url": "<signed-url>",
  "stamp_url": null
}
```

**Response `data`** (guest — note `key` is `null` until approved, `available_keys` populated instead):

```json
{
  "request_id": "<uuid>",
  "status": "PENDING_HOD",
  "decidable": true,
  "is_guest": true,
  "requested_for": "2026-08-22",
  "requester_name": "Jane Doe",
  "requested_room": "Senate Hall A",
  "id_document_type": "National ID",
  "id_document_number": "A1234567",
  "key": null,
  "available_keys": [
    { "id": "<uuid>", "code": "NS-304", "room_name": "Senate Hall A" }
  ],
  "letter_url": "<signed-url>",
  "stamp_url": null
}
```

`decidable` is `status === 'PENDING_HOD'` **and** the requested weekend has not passed (Lagos date) — the page renders Approve/Decline only when `true`; otherwise it renders the state named by `status` (a `PENDING_HOD` request past its date shows "Date has passed"). `available_keys` is only populated when `is_guest && decidable`; empty otherwise.

The link needs no login, so what it returns is limited (since 2026-10-13):

- **While decidable**, `id_document_number` is masked to its last four characters (`•••• 4567`). The Dean sees the full number on the dashboard; the verifier checks the physical document at the desk.
- **Once not decidable** (decided, cancelled, expired, or past its date), the letter and stamp are not signed (`letter_url`/`stamp_url` are `null`) and `id_document_type`/`id_document_number` are `null`. A forwarded or leaked email still opens the page, but shows only the outcome.

The link therefore works only until the requested weekend passes; `approve_weekend` already refused a past date, but the page used to keep showing the guest's details and letter indefinitely.

**Errors**: `404` token not found or malformed

---

#### POST /api/public/dean-decision/[token]

**File**: `src/app/api/public/dean-decision/[token]/route.ts`
**Roles**: ALL (unauthenticated)

| Field      | Type                       | Required                        |
| ---------- | -------------------------- | ------------------------------- |
| `decision` | `'APPROVED' \| 'DECLINED'` | yes                             |
| `note`     | `string`                   | no                              |
| `key_id`   | `string` (uuid)            | guest requests, `APPROVED` only |

Re-resolves the **current** Dean of the request's unit at decision time (not an identity captured when the email was sent, so a Dean handover in between is handled correctly) — for a guest request the unit comes from `requested_unit_id` (no `key_id` exists yet); for a registered request, from the request's own `key_id`. Then calls `decideWeekend` with that Dean as the actor — the same module as `POST /api/requests/hod-decision`, which reads the letter/stamp to verify from the request row itself (registered requests only; guest approvals review the letter manually) and, for a guest `APPROVED` decision, calls `approve_guest_weekend` with the chosen `key_id`.

**Response `data`**: identical shape to `POST /api/requests/hod-decision` — `{ "request_id": "<uuid>", "status": "APPROVED" | "DECLINED" }`, or the held-mismatch shape `{ "request_id": "<uuid>", "status": "HELD_SIGNATURE_MISMATCH", "mismatches": {...}, "message": "..." }` (still HTTP 200; never reachable for a guest request, which has no reference signature to mismatch against).

**Errors**: `403` the unit is no longer Dean-authorised, or has no Dean · `404` token not found, or the request resolves to no unit · `409` request is no longer `PENDING_HOD` (already decided — the page refetches to show the real terminal state), or its requested date has passed · `422` validation, or (guest `APPROVED` only) no `key_id` supplied

---

## 3. Keys

### POST /api/keys/return

**File**: `src/app/api/keys/return/route.ts`
**Roles**: VERIFIER
**RPC**: `return_key(request_id, verifier_id, code?, returner_id?, override_reason?)`

The verifier is the server-verified session user (`user.id`), never a client-supplied id. Exactly one of `code` or `override_reason` must be present:

- **`code`** — the 6-digit return code the requester read out (verified path → `KEY_RETURNED` audit event).
- **`override_reason`** — completes the return without a code when the requester can't produce one (unverified path → `KEY_RETURNED_UNVERIFIED` audit event, plus a `SUSPICIOUS_ACTIVITY` incident raised to the CSO when an open shift exists).

| Field             | Type                | Required                                         |
| ----------------- | ------------------- | ------------------------------------------------ |
| `request_id`      | `string` (uuid)     | yes                                              |
| `code`            | `string` (6 digits) | one of code / override_reason                    |
| `override_reason` | `string` (min 3)    | one of code / override_reason                    |
| `returner_id`     | `string` (uuid)     | no — if returner differs from original requester |

**Response `data`**: `{ "request_id": "<uuid>", "returned_at": "<iso>", "verified": true }`

**Errors**: `404` transaction not found / return code not recognised or expired · `409` already returned · `422` neither code nor reason supplied

---

### GET /api/keys/out

**File**: `src/app/api/keys/out/route.ts`
**Roles**: CSO, VERIFIER

Returns every request with `status = 'KEY_ISSUED'` — every copy physically out — joined with requester and key details. There is no `KEY_OVERDUE` request status in the database; an overdue key is a `KEY_ISSUED` request past its `return_deadline`.

**Query params**: `zone` (`NEW_SENATE | OLD_SENATE`) · `overdue_only` (`'true' | 'false'` — `true` filters on `return_deadline < now`). Anything else → `422 Invalid query parameters` (since 2026-10-15).

**Errors**: `422` invalid query params · `500` query failure, with a correlation reference (was an un-ref'd `500 Failed to fetch outstanding keys` until 2026-10-15)

**Response `data`**: `{ "outstanding": [...] }`. Each row is shaped by `shapeOutstanding` (`src/lib/keys/outstanding.ts`):

- `is_overdue` — `true` once the row's `return_deadline` has passed. The same rule as `public.request_is_overdue(status, return_deadline)`, derived from the clock rather than read from `keys.status` (which only flips on the hourly `mark_key_overdue()` cron). **Read this.**
- `status` — **deprecated**. `'KEY_OVERDUE'` when `is_overdue`, else `'KEY_ISSUED'`. A display-only value kept for one release so older clients keep rendering; it will be removed.
- `requester` — the registered requester, or a guest holder folded in with `photo_url: null`.

The verifier dashboard's first paint (`getOutstandingKeysSeed` in `src/lib/queries/verifier-dashboard.ts`) shapes its rows through the same function.

---

### GET /api/keys/availability

**File**: `src/app/api/keys/availability/route.ts`
**Roles**: REQUESTER

The requester-facing counterpart to `GET /api/keys/out` above. For every key the caller holds an authorisation slot on, reports whether that key is free and — when it is physically out — who is holding it, so a requester can stop walking to the Senate Building desk to find out.

No query params. No request body.

**Response `data`**:

```json
{
  "keys": [
    {
      "key_id": "<uuid>",
      "state": "OUT",
      "key_count": 3,
      "available_count": 0,
      "return_deadline": "<iso>",
      "issued_at": "<iso>",
      "holder": { "full_name": "Dr. Bakare", "is_guest": false },
      "holders": [
        { "full_name": "Dr. Bakare", "is_guest": false },
        { "full_name": "Jane Doe", "is_guest": true }
      ]
    }
  ]
}
```

A key record is a room's set of `key_count` **interchangeable copies**, so availability is a count, not a boolean. A request _occupies_ one copy while it is `KEY_ISSUED`, or `CODE_ISSUED` with an unexpired code — the same rule the `requests_key_capacity` trigger enforces (`public.request_occupies_key`). The counts and `state` come from `src/lib/keys/occupancy.ts`, which mirrors that predicate and `public.request_is_overdue` and is held to them by matching truth tables (`src/tests/keys/occupancy.test.ts` ↔ `supabase/tests/11_key_occupancy_test.sql`); `src/lib/keys/availability.ts` only adds who is holding a copy. The CSO dashboard's per-zone counts use the same rule server-side via `get_key_occupancy()`, so the two agree. `available_count` is `key_count` minus the occupants.

`state` is one of `AVAILABLE` · `SPOKEN_FOR` · `OUT` · `OVERDUE` · `RETIRED`:

- `RETIRED` — the key row's own status, and it wins over any request.
- `AVAILABLE` — `available_count > 0`. A partially-out room is still requestable, and still lists its current `holders`.
- `OVERDUE` — no copies left and at least one holder is past their deadline. Derived from `return_deadline < now`, not read from `keys.status` (which only flips on the hourly `mark_key_overdue()` cron, and for a multi-copy room cannot tell one late holder from all of them).
- `OUT` — no copies left and at least one is physically held.
- `SPOKEN_FOR` — no copies left and every hold is an unexpired code. **`holders` is empty here by design**: a code that may simply expire in ten minutes is not worth naming a colleague over.

Because `state` is already capacity-aware, requestability stays a pure function of it — `UNREQUESTABLE_STATES` in `src/components/smartkey/key-availability-status.ts` needs no count logic.

`holders` lists everyone _physically_ holding a copy, earliest first; `holder` is the first of them, retained for callers that predate multi-copy rooms. Both carry `full_name` and `is_guest` (guests hold keys at weekends) — nothing else. The response deliberately contains **no `code`, no `return_code`, no `photo_url`, no `risk_tier`**; there is no `rewriteStorageUrls` call because no storage URL is selected. A requester is told who has the key, never shown their passport photo — that exists for desk identity verification.

**Scope and enforcement**. This is the only route that shows one requester another requester's activity, so note where the boundary lives. RLS is deliberately **not** widened: `requests_select` scopes a REQUESTER to `requester_id = auth.uid()`, and `requests` holds `code` and `return_code`, so a policy loose enough to expose a holder's name would expose live collection codes to every co-authorised requester. Instead the route reads past RLS with the admin client and applies its own check — the same pattern `GET /api/keys/out` uses. The scope is the caller's own `authorisations` rows, filtered in the handler on the session user's id. `authorisations_select_all` is `USING (true)`, so **RLS does not scope that read; the explicit `.eq('profile_id', user.id)` does**, and it must never be driven by a client-supplied parameter.

Read-only, so no audit entry — `audit_log` records consequential actions, not queries.

**Errors**: `401` unauthenticated or profile missing · `403` not a REQUESTER · `500` query failure (correlation ref in the error string)

---

### GET /api/keys/history

**File**: `src/app/api/keys/history/route.ts`
**Roles**: CSO, DEAN

**Query params**: `key_id` (uuid) · `requester_id` (uuid) · `from` / `to` (ISO date or timestamp) · `limit` (positive integer, default 50, clamped to 100) · `cursor` (the `next_cursor` from a previous page: a `created_at` timestamp). A malformed value → `422 Invalid query parameters` (since 2026-10-15; these used to reach Postgres and answer `500`).

A Dean sees only their faculty's keys. The route scopes this itself — it reads the unit's key ids and filters on them — rather than relying on RLS alone. A Dean with no `unit_id` gets an empty page without any query (until 2026-10-15 they got no filter at all, leaving RLS as the only scope); an empty page rather than a `403` so the Dean dashboard's activity feed still renders. CSO sees all.

**Errors**: `422` invalid query params · `500` query failure, with a correlation reference

**Response `data`**: `{ "transactions": [...], "next_cursor": "<opaque>" }`

---

### POST /api/keys/mark-lost

**File**: `src/app/api/keys/mark-lost/route.ts`
**Roles**: CSO
**RPC**: `mark_key_lost(key_id, note)`

| Field    | Type            | Required |
| -------- | --------------- | -------- |
| `key_id` | `string` (uuid) | yes      |
| `note`   | `string`        | yes      |

Sets key `status = 'RETIRED'` (and `retired_at`), creates an incident of type `MISSING_KEY`, severity `HIGH`, filed against the open shift if there is one, and writes a `KEY_MARKED_LOST` audit entry — all in one transaction inside the RPC, with the CSO taken from the session. Retiring is not refused while someone still holds a copy; the audit payload's `open_requests` records how many requests currently occupy one, so the CSO can follow up. Until 2026-10-13 the route made the two writes separately and wrote no audit entry, so an incident-insert failure left a retired key with no incident.

**Response `data`**: `{ "key_id": "<uuid>", "incident_id": "<uuid>" }`

**Errors**: `401` unauthenticated or no profile · `403` not CSO · `404` key not found · `409` key already retired · `422` validation (including a whitespace-only note) · `500` RPC failure, with a correlation reference

---

## 4. User Administration

### POST /api/admin/users

**File**: `src/app/api/admin/users/route.ts`
**Roles**: CSO
**RPC**: `provision_user(name, email, role, department_id?)` — the RPC parameter keeps its historical `p_department_id` name but writes to `profiles.unit_id`; `record_invite_resent(profile_id, full_name?, unit_id?)` for a re-invite; `reinstate_user(profile_id, full_name?, unit_id?)` (and `deactivate_user` as compensation) for a reinstatement

| Field                 | Type                                  | Required           |
| --------------------- | ------------------------------------- | ------------------ |
| `full_name`           | `string` (trimmed, max 120)           | yes                |
| `institutional_email` | `string` (email)                      | yes                |
| `role`                | `'DEAN' \| 'VERIFIER' \| 'REQUESTER'` | yes                |
| `unit_id`             | `string` (uuid)                       | DEAN and REQUESTER |

The auth account (GoTrue) and the profile (Postgres) cannot share a transaction, and neither can the email, so each path is ordered so that a failure leaves nothing half-done:

- **New email** (`src/lib/admin/provision-new-user.ts`): `admin.generateLink({ type: 'invite' })` creates the auth user and mints its token; `provision_user` then creates the profile, the activation token and `USER_PROVISIONED` in one transaction; only then is the activation link emailed via Nodemailer (Gmail SMTP). If `provision_user` fails the route deletes the auth user it just created (`admin.deleteUser`), so no invited account is left without a profile, and no email is sent — except on `DUPLICATE_PROFILE`, where a profile already owns that auth account and `profiles.id` cascades from `auth.users`. Until 2026-10-14 the email went out before `provision_user`, and a failure left an orphaned, invited auth account.
- **`PENDING_ACTIVATION` profile** (re-invite): a fresh `magiclink` is generated first; `record_invite_resent` then applies the form's name/unit correction and writes `USER_INVITE_RESENT` in one transaction; then the email. Answers `200`.
- **`DEACTIVATED` profile** (reinstatement, `src/lib/admin/reinstate-user.ts`): link first, then `reinstate_user` (status back to `PENDING_ACTIVATION`, the name/unit correction, `units.hod_id` for a Dean, and `USER_REINSTATED`, atomically), then the auth ban is lifted. If the ban cannot be lifted, `deactivate_user` puts the profile back (a `USER_DEACTIVATED` entry follows the `USER_REINSTATED` one, which is what happened) and the route answers `500`. The reverse order could leave a `DEACTIVATED` profile whose account can sign in. Answers `200`.

Until 2026-10-14 both re-invite paths reset the profile through the service-role client and wrote no audit entry. A re-invite never changes the profile's role, so the activation link follows the stored role, not the form's. The token never leaves the server; the email is best effort on every path (a send failure is logged and the response is unchanged).

**Response `data`**: `{ "profile_id": "<uuid>", "status": "PENDING_ACTIVATION" }`. Returns `201` for a new user (the envelope `status` says `201` too since 2026-10-13; it used to say `200`), `200` for a re-invite.

**Errors**: `401` unauthenticated or no profile · `403` not CSO · `404` the re-invited profile disappeared · `409` email already registered to an `ACTIVE` user, or `"That unit already has an active Dean."` (until 2026-10-14: "This department already has an active HOD"), or `"User status changed. Refresh and try again."` when a concurrent change beat the re-invite · `422` validation, no `unit_id` for a Dean or Requester, or `Unit not found` · `500` link generation (on a re-invite too, since 2026-10-14; it used to answer `200` without a link), RPC failure, or a ban that could not be lifted, with a correlation reference

---

### GET /api/admin/users

**File**: `src/app/api/admin/users/route.ts`
**Roles**: CSO

No query params — the route returns every non-deactivated profile unconditionally (joined with `unit:units!unit_id(name)`) and defers role/unit/status filtering and pagination to the client. There is no cursor-based pagination.

Each user's `last_sign_in_at` field is sourced from `profiles.last_login_at` (app-stamped on completed login — see `docs/DATABASE.md`), not Supabase Auth's `auth.users.last_sign_in_at`. The wire field name is unchanged from before; only its backing source is.

**Response `data`**: `{ "users": [...] }`

---

### PATCH /api/admin/users/[id]/revoke

**File**: `src/app/api/admin/users/[id]/revoke/route.ts`
**Roles**: CSO

**RPC**: `deactivate_user(profile_id)`

No request body. The flow lives in `src/lib/admin/revoke-user.ts`, because the auth ban (GoTrue) and the profile change (Postgres) cannot share a transaction:

1. Check the target exists and is not already deactivated (`404` / `409`, before anything changes).
2. Ban the auth user (`ban_duration` ~100 years) — the only thing that actually locks them out, and reversible.
3. `deactivate_user` sets `status = 'DEACTIVATED'`, clears any `units.hod_id` pointing at them, and writes `USER_DEACTIVATED`, atomically.
4. If step 3 fails, lift the ban so the user is back where they started — except on `CONFLICT` (a concurrent revoke won), where the ban is correct and stays.

Until 2026-10-13 a failed ban was logged and the route still answered `200`, leaving a "deactivated" user who could sign in; it is now a `500`.

**Response `data`**: `{ "profile_id": "<uuid>", "status": "DEACTIVATED" }`

**Errors**: `404` user not found · `409` already deactivated · `500` the ban or the RPC failed (correlation ref)

---

### POST /api/admin/users/[id]/resend-invite

**File**: `src/app/api/admin/users/[id]/resend-invite/route.ts`
**Roles**: CSO

**RPC**: `record_invite_resent(profile_id)`

No request body. Re-sends a fresh activation link for a user still `PENDING_ACTIVATION` (e.g. their original 24-hour link expired unused). The link is generated first, then `record_invite_resent` re-checks the status under a lock and writes `USER_INVITE_RESENT`, then the email is sent. An email cannot be part of a transaction, so the entry records that a fresh link was issued; a send that then fails still answers `500 Could not send email`. Until 2026-10-14 nothing was audited.

**Response `data`**: `{ "profile_id": "<uuid>", "status": "PENDING_ACTIVATION" }`

**Errors**: `404` user not found · `409` user is already `ACTIVE` or is `DEACTIVATED` (reinstate first) · `500 Could not generate link. Ref: …` / `Could not send email. Ref: …`, or a ref'd `500` for an RPC failure

---

### PATCH /api/admin/users/[id]

**File**: `src/app/api/admin/users/[id]/route.ts`
**Roles**: CSO

**RPC**: `update_user_profile(profile_id, full_name, unit_id?)`

Edits an existing user's `full_name` and — for departmental roles (Dean, REQUESTER) — `unit_id`. Email and role are intentionally **not** editable here: the email is the auth login identity and chain-of-trust anchor, and role changes are out of scope. The RPC writes the profile, keeps the `units.hod_id` reverse link in sync when a Dean moves, and writes a `USER_UPDATED` entry recording only the fields that changed, in one transaction. The one-Dean-per-unit check runs under a lock on the destination unit.

| Field       | Type                        | Required                   |
| ----------- | --------------------------- | -------------------------- |
| `full_name` | `string` (trimmed, max 120) | yes                        |
| `unit_id`   | `string` (uuid)             | Dean and REQUESTER targets |

**Response `data`**: `{ "profile_id": "<uuid>", "full_name": "<name>", "unit_id": "<uuid|null>" }`

**Errors**: `404` user not found · `409` destination unit already has an active Dean · `422` validation / unit required / unit not found

---

### GET /api/admin/units

**File**: `src/app/api/admin/units/route.ts`
**Roles**: CSO

No query params. Returns every unit (faculty or Administration) with its Dean, a `has_hod` flag (`true` when an `ACTIVE` Dean is already assigned — used to grey out that unit in the Dean-role picker on `POST /api/admin/users`), and a `has_slot_today` flag: `true` when at least one copy of a non-retired key in the unit is free right now — `available > 0` in `get_key_occupancy()`. That counts copies (a twelve-copy room with three out still has a slot) and treats a copy reserved by a live collection code as taken; it used to read `keys.status = 'AVAILABLE'`, which could express neither. No UI reads this flag today. A `get_key_occupancy()` failure returns `500` with a correlation reference.

**Response `data`**: `{ "units": [...] }`

---

### POST /api/admin/keys

**File**: `src/app/api/admin/keys/route.ts`
**Roles**: CSO

| Field       | Type                                 | Required                                                                                                 |
| ----------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `code`      | `string` (matches `^[A-Z0-9]+-\d+$`) | yes                                                                                                      |
| `zone`      | `'NEW_SENATE' \| 'OLD_SENATE'`       | yes                                                                                                      |
| `room_name` | `string`                             | yes                                                                                                      |
| `unit_id`   | `string` (uuid)                      | yes                                                                                                      |
| `key_count` | `integer` (1–20, default 1)          | no — how many interchangeable copies of this room’s key exist, i.e. how many people may hold one at once |

**RPC**: `create_key(code, zone, room_name, unit_id, key_count?)`

Creates a new key record (status `AVAILABLE`) and writes `KEY_CREATED` in one transaction. Returns `201`. Until 2026-10-14 it was a direct insert under the `keys_insert_cso` RLS policy with no audit entry; that policy is dropped, so `create_key` is the only way a key is created.

**Response `data`**: `{ "key_id": "<uuid>" }`

**Errors**: `401` unauthenticated or no profile (a session with no profile row was `403` until 2026-10-13) · `403` not CSO · `409` `Key code "<code>" is already in use.` · `422` validation, or `Unit not found` (an unknown unit was a ref'd `500` until 2026-10-14) · `500` with a correlation reference

---

### POST /api/admin/authorisations

**File**: `src/app/api/admin/authorisations/route.ts`
**Roles**: Dean (faculty keys), CSO (Administration keys)
**RPC**: `nominate_collector(key_id, requester_id)`

Submits a collector nomination. The route delegates entirely to the `nominate_collector` RPC, which is authoriser-aware: a Dean nominates for keys in their own faculty, the CSO nominates for `authoriser='CSO'` (Administration) keys. Enforces the max-3-per-key constraint at the DB level.

| Field          | Type            | Required |
| -------------- | --------------- | -------- |
| `key_id`       | `string` (uuid) | yes      |
| `requester_id` | `string` (uuid) | yes      |

**Response `data`**: `{ "authorisation_id": "<composite>", "slot_number": 2 }`

The route checks the role (CSO or Dean) before the RPC, as defence in depth; until 2026-10-13 it had no role check, so any signed-in user reached the RPC. The RPC still decides which keys each may touch.

**Errors**: `401` unauthenticated or no profile · `403` not a CSO or Dean · `403` "Key not in your department" (a Dean on another faculty's key) · `403` "Only the CSO can manage collectors for Administration keys" (anyone but the CSO on an Administration key; this used to say "Key not in your department" too) · `404` key not found · `409` three slots already filled · `409` requester already authorised for this key · `422` validation, or the requester is not an active REQUESTER · `500` with a correlation reference (including an RPC that returns no row, which used to answer `201` with a `null` `slot_number`)

Returns `201`; the envelope `status` says `201` too since 2026-10-13 (it used to say `200`).

---

### DELETE /api/admin/authorisations/[key_id]/[requester_id]

**File**: `src/app/api/admin/authorisations/[key_id]/[requester_id]/route.ts`
**Roles**: Dean (faculty keys), CSO (Administration keys)
**RPC**: `remove_collector(key_id, requester_id)`

Removes a collector from a slot. Authoriser-aware via the `remove_collector` RPC (Dean for their faculty's keys, CSO for Administration keys). Writes audit entry.

**Response `data`**: `null` (204)

**Errors**: `401` unauthenticated or no profile · `403` not a CSO or Dean (route-level since 2026-10-13) · `403` key not in your scope, with the same two messages as the nomination route · `404` authorisation not found, the key does not exist, or either path segment is not a UUID (a malformed id used to reach the RPC and fail as a `500`)

---

### GET /api/admin/risk-rules

**File**: `src/app/api/admin/risk-rules/route.ts`
**Roles**: CSO

Hydrates the `/cso/settings` "Risk rules" screen. Returns the 5 `risk_rule_config` rows and the `risk_tier_config` singleton, in the DB's native inclusive-lower-bound tier framing (`medium_min`/`high_min`) — the UI converts to its "Low ≤ / Medium ≤ / High >" display at the component boundary.

**Response `data`**:

```json
{
  "rules": [
    { "rule_key": "outside_operational_hours", "weight": 3, "enabled": true }
  ],
  "tier": { "medium_min": 4, "high_min": 7 }
}
```

**Errors**: `401` unauthenticated · `403` not CSO · `500` config read failure

---

### PATCH /api/admin/risk-rules

**File**: `src/app/api/admin/risk-rules/route.ts`
**Roles**: CSO
**RPC**: `update_risk_config(rules, medium_min, high_min)`

| Field              | Type                                                      | Required |
| ------------------ | --------------------------------------------------------- | -------- |
| `rules`            | array of exactly 5 `{rule_key, weight, enabled}`          | yes      |
| `rules[].rule_key` | one of the 5 canonical rule keys (see `docs/DATABASE.md`) | yes      |
| `rules[].weight`   | `number` (1–10)                                           | yes      |
| `rules[].enabled`  | `boolean`                                                 | yes      |
| `tier.medium_min`  | `number` (≥1)                                             | yes      |
| `tier.high_min`    | `number` (> `tier.medium_min`)                            | yes      |

Zod validates the shape (exactly 5 rules, no duplicate `rule_key`, every canonical key present, `high_min > medium_min`) before the RPC runs; the RPC re-validates the same invariants server-side. One save = one `RISK_CONFIG_UPDATED` audit entry, not one per rule. Takes effect on the next `POST /api/requests/submit` call — existing requests' stored `risk_tier`/`risk_factors` are not retroactively recomputed.

**Response `data`**: echoes the saved `{ rules, tier }`.

**Errors**: `401` unauthenticated · `403` not CSO · `422` validation (zod, or RPC `INVALID_TIER_BOUNDS`/`INVALID_RULES`) · `500` RPC failure

---

### GET /api/admin/operational-config

**File**: `src/app/api/admin/operational-config/route.ts`
**Roles**: CSO

Hydrates the `/cso/settings` "Operational" screen (previously a static mockup — see `docs/REVIEW_ACTIONS_BACKEND.md`). Returns the 2 `zone_hours` rows and the `operational_config` singleton, all times as `"HH:MM"`.

**Response `data`**:

```json
{
  "zones": [
    {
      "zone": "NEW_SENATE",
      "weekday_open": "06:00",
      "weekday_close": "22:00",
      "weekend_closed": true,
      "weekend_open": "08:00",
      "weekend_close": "18:00"
    }
  ],
  "return_deadline_time": "17:00",
  "code_expiry_minutes": 10
}
```

**Errors**: `401` unauthenticated · `403` not CSO · `500` config read failure

---

### PATCH /api/admin/operational-config

**File**: `src/app/api/admin/operational-config/route.ts`
**Roles**: CSO
**RPC**: `update_operational_config(zone_hours, return_deadline_time, code_expiry_minutes)`

| Field                        | Type                                          | Required |
| ---------------------------- | --------------------------------------------- | -------- |
| `zones`                      | array of exactly 2 zone-hours objects (below) | yes      |
| `zones[].zone`               | `'NEW_SENATE' \| 'OLD_SENATE'`                | yes      |
| `zones[].weekday_open/close` | `"HH:MM"`                                     | yes      |
| `zones[].weekend_closed`     | `boolean`                                     | yes      |
| `zones[].weekend_open/close` | `"HH:MM"`, required unless `weekend_closed`   | no       |
| `return_deadline_time`       | `"HH:MM"`                                     | yes      |
| `code_expiry_minutes`        | `number` (5–60)                               | yes      |

Zod validates the shape (exactly 2 zones covering both enum values, `HH:MM` format, weekend hours present when not closed) before the RPC runs; the RPC re-validates the same invariants server-side, plus that each zone's open time precedes its close time. One save = one `OPERATIONAL_CONFIG_UPDATED` audit entry. Takes effect on the next `POST /api/requests/submit` / code-generation call — requests already in progress keep their original deadline and code expiry.

Only the **collection**-code expiry is affected — the separate return-code expiry (`request_return`/`request_return_guest`, 15 minutes) is untouched.

**Response `data`**: echoes the saved `{ zones, return_deadline_time, code_expiry_minutes }`.

**Errors**: `401` unauthenticated · `403` not CSO · `422` validation (zod, or RPC `INVALID_ZONE_HOURS`/`INVALID_CONFIG`) · `500` RPC failure

---

## 5. Shifts and Handover

### POST /api/shifts/start

**File**: `src/app/api/shifts/start/route.ts`
**Roles**: VERIFIER

No request body. Starts a new shift for the calling verifier: rejects with `409` if a shift is already active (`ended_at IS NULL`) — the officer should go through handover instead. Otherwise derives the next shift number (wraps 1→2→3→1) and inserts the row.

**Response `data`**: `{ "shift": { "id": "<uuid>", "shift_number": 1, "started_at": "<iso>" } }`. Returns `201`.

**Errors**: `401` unauthenticated · `403` not VERIFIER · `409` a shift is already active

---

### GET /api/shifts/current

**File**: `src/app/api/shifts/current/route.ts`
**Roles**: VERIFIER, CSO

Returns the active shift record with officer identities and elapsed time.

**Response `data`**: `{ "shift": { "id": "<uuid>", "shift_number": 2, "started_at": "<iso>", "primary_officer": {...} } }`

**Errors**: `500` query failure, with a correlation reference

---

### POST /api/shifts/handover

**File**: `src/app/api/shifts/handover/route.ts`
**Roles**: VERIFIER
**RPC**: `acknowledge_shift_handover(outgoing_shift_id, key_ids, bulk)`

| Field               | Type                    | Required                      |
| ------------------- | ----------------------- | ----------------------------- |
| `outgoing_shift_id` | `string` (uuid)         | yes                           |
| `key_ids`           | `string[]` (uuid array) | yes — all outstanding key IDs |
| `bulk`              | `boolean`               | yes                           |

If `bulk = true`, all keys are acknowledged in one confirmation. Audit entry written per key.

**Response `data`**: `{ "handover_id": "<uuid>", "acknowledged_count": 3 }`

**Errors**: `409` handover already completed for this shift · `422` key_ids does not match actual outstanding keys

---

## 5a. Profile (self-service, any authenticated role)

### GET /api/profile/me

**File**: `src/app/api/profile/me/route.ts`
**Roles**: ALL (authenticated)

Returns the caller's own profile, including role-specific fields (`signature_ref_url`, `stamp_ref_url` for Deans) and the joined unit name. Backs every role's account-settings page. Storage URLs are returned as proxy URLs (`toProxyUrl`), never raw Storage URLs.

**Response `data`**: `{ "profile": { "id", "full_name", "institutional_email", "role", "status", "photo_url", "signature_ref_url", "stamp_ref_url", "unit_id", "unit": { "id", "name" } } }`

**Errors**: `401` unauthenticated, or no profile row · `500` query failure, with a correlation reference. Until 2026-10-14 both a missing profile and a failed query were `404 Profile not found`.

---

### PATCH /api/profile/me

**File**: `src/app/api/profile/me/route.ts`
**Roles**: ALL (authenticated)

Only `full_name` is mutable here — email is managed by Supabase Auth, photo by `POST /api/profile/photo`, and a Dean's signature/stamp by `POST /api/profile/signature`.

| Field       | Type                        | Required |
| ----------- | --------------------------- | -------- |
| `full_name` | `string` (trimmed, max 120) | yes      |

The update runs with the caller's session, so the `profiles` column guard (`docs/DATABASE.md`) would reject any other column even if the route sent one. The body is read by hand to keep its two messages, `422 Invalid JSON` and `422 full_name is required`. The name is trimmed and at most 120 characters (`FULL_NAME_MAX` in `src/lib/validation/primitives.ts`, the same limit as the CSO user-admin routes and the guest form); longer is `422 Full name must be 120 characters or fewer.` (no limit until 2026-10-14).

**Response `data`**: `{ "full_name": "<name>" }`

**Errors**: `401` unauthenticated, or no profile row (until 2026-10-14 the update ran anyway and answered `200`) · `422` unparseable body, missing/blank `full_name`, or over 120 characters · `500` update failure

---

### POST /api/profile/photo

**File**: `src/app/api/profile/photo/route.ts`
**Roles**: ALL (authenticated)

Multipart form; replaces the caller's own profile photo in the `passport-photos` bucket. One route serves every role's settings screen (the storage folder is keyed by user id, not a role namespace).

| Field   | Type                    | Required |
| ------- | ----------------------- | -------- |
| `photo` | `File` (image, max 5MB) | yes      |

Uploaded and saved with the service-role client, since `photo_url` is not writable from a user session; the object path (`{uid}/passport.{ext}`) comes from the session user, never the request. The type and `{ext}` are detected from the file's bytes (PNG, JPEG or WebP); the declared type and filename are ignored, and SVG is refused. After the profile is saved, any other `passport.*` in the folder (an earlier photo with a different extension) is removed, best-effort: a failure is logged and the response is still `200`.

**Response `data`**: `{ "photo_url": "<url>" }` — a proxy URL with a cache-busting `v` param.

**Errors**: `401` unauthenticated, or no profile row (until 2026-10-14 the photo was uploaded and the route answered `200`) · `413` over 5MB · `422` not multipart, missing file, or bytes that are not a PNG/JPEG/WebP ("File must be a PNG, JPEG or WebP image"; until 2026-10-14 "File must be an image", judged on the declared `image/*` type, which let SVG through) · `500` upload or save failure

---

### DELETE /api/profile/photo

**File**: `src/app/api/profile/photo/route.ts`
**Roles**: ALL (authenticated)

No request body. Removes the caller's own photo file(s) from storage and clears `photo_url`.

**Response `data`**: `null`

**Errors**: `401` unauthenticated, or no profile row (was `200` until 2026-10-14) · `500` remove or clear failure

---

### POST /api/profile/signature

**File**: `src/app/api/profile/signature/route.ts`
**Roles**: DEAN

Replaces a Dean's signature or stamp reference image (post-onboarding). If a reference is already on file, the new upload is compared pixel-level against it via the same Sharp + Pixelmatch pipeline as `POST /api/ai/verify-signature` before the replacement is allowed.

| Field   | Type                     | Required |
| ------- | ------------------------ | -------- |
| `type`  | `'signature' \| 'stamp'` | yes      |
| `image` | `File` (image, max 5MB)  | yes      |

The image's type is detected from its bytes (PNG, JPEG or WebP) before the plausibility pass, and the upload is stored under that type and extension. Until 2026-10-14 the declared `image.type` was stored as given, so a valid PNG labelled `text/html` was stored as HTML.

If the mismatch exceeds `SIGNATURE_DIFF_THRESHOLD`, the reference is **held, not replaced**: the service-only `hold_signature_reference` RPC writes the `pending_signature_references` row (see `docs/DATABASE.md`) and the `SIGNATURE_MISMATCH` audit entry (`context: 'reference_replacement'`, including `pending_url`) together. Every upload is stored at its own Storage path (`{uid}/{type}-{uuid}.{ext}`), so the live reference file is never overwritten in place. The response reports the held state (still HTTP 200) and the current reference stays active in the meantime. The CSO reviews the pending upload against the current reference on `/cso/dashboard` (same "Signature mismatches" card as the weekend-request mismatches) and resolves it via `POST /api/admin/signature-references/resolve` — approve to replace the reference, or decline to discard the pending upload. Otherwise (verification passes) the service-only `set_signature_reference` RPC replaces the reference, clears any stale held upload for that type, and writes `SIGNATURE_REFERENCE_UPDATED`. Both RPCs refuse (`409`) if the reference changed while the upload was being verified, and the unused upload is then removed.

**Response `data`** (held): `{ "status": "HELD_SIGNATURE_MISMATCH", "mismatch_pct": <number>, "message": "..." }`
**Response `data`** (updated): `{ "status": "updated", "new_url": "<url>" }`

**Errors**: `401` unauthenticated · `403` not DEAN · `409` the reference changed during verification — retry · `413` over 5MB · `422` missing/invalid type or image, or an image that is not a PNG/JPEG/WebP ("image must be a PNG, JPEG or WebP file") · `500` storage, verification or RPC failure (correlation ref)

---

### POST /api/admin/signature-references/resolve

**File**: `src/app/api/admin/signature-references/resolve/route.ts`
**Roles**: CSO
**RPC**: `resolve_pending_signature_reference(profile_id, type, decision, note?)`

Resolves a held reference-replacement mismatch from `POST /api/profile/signature` above. Mirrors the CSO's held-mismatch resolution on `POST /api/requests/hod-decision` for weekend requests, but for a Dean's own onboarded reference rather than a request. `decision: 'APPROVED'` replaces `profiles.signature_ref_url`/`stamp_ref_url` with the pending upload; `decision: 'DECLINED'` discards it. Either way the pending row is deleted. The RPC raises `NOT_FOUND` if there's no pending row for that `profile_id`/`type`.

| Field        | Type                       | Required |
| ------------ | -------------------------- | -------- |
| `profile_id` | `string` (uuid)            | yes      |
| `type`       | `'signature' \| 'stamp'`   | yes      |
| `decision`   | `'APPROVED' \| 'DECLINED'` | yes      |
| `note`       | `string`                   | no       |

**Response `data`**: `{ "status": "APPROVED" | "DECLINED", "new_url": "<url>" | null }` (`new_url` is the new reference's proxy URL, `/api/storage/object?...`, on approval, `null` on decline). Until 2026-10-14 it was the raw storage URL, which a browser cannot load from the private `hod-signatures` bucket. The profile and the audit entry keep the canonical URL.

**Errors**: `401` unauthenticated · `403` not CSO · `404` no pending reference for this profile/type · `422` validation · `500` with a correlation reference (an RPC that returns no row used to throw past the handler as Next's bare `500`)

---

### GET /api/profile/notification-preferences

**File**: `src/app/api/profile/notification-preferences/route.ts`
**Roles**: ALL (authenticated) — shared by the Requester, Dean, and CSO settings UIs; each only reads the fields it displays

RLS-scoped direct read of the caller's own `notification_preferences` row. Returns defaults (all `true` except `digest_email`) if no row exists yet — a row is only created on first save, not on read.

**Response `data`**: `{ "key_issued_in_app": true, "overdue_email": true, "weekend_decided_email": true, "weekend_submitted_in_app": true, "weekend_submitted_email": true, "signature_mismatch_email": true, "digest_email": false }`

**Errors**: `401` unauthenticated, or no profile row (until 2026-10-14 it answered `200` with the defaults) · `500` read failure

---

### PATCH /api/profile/notification-preferences

**File**: `src/app/api/profile/notification-preferences/route.ts`
**Roles**: ALL (authenticated)

| Field                      | Type      | Required             |
| -------------------------- | --------- | -------------------- |
| `key_issued_in_app`        | `boolean` | no — Requester field |
| `overdue_email`            | `boolean` | no — Requester field |
| `weekend_decided_email`    | `boolean` | no — Requester field |
| `weekend_submitted_in_app` | `boolean` | no — Dean field      |
| `weekend_submitted_email`  | `boolean` | no — Dean field      |
| `signature_mismatch_email` | `boolean` | no — CSO field       |
| `digest_email`             | `boolean` | no — Dean/CSO field  |

All fields are individually optional but at least one is required. Upserts the caller's own row (RLS-scoped, `onConflict: 'profile_id'`) — Postgrest only touches the columns present in the body, so a Dean's PATCH never disturbs the Requester-only columns and vice versa. No RPC, no audit entry — self-service preference data at the same trust level as `PATCH /api/profile/me`. There is no `code_email` field: the collection-code email can't be disabled. `digest_email` **defaults to `false`** — the opposite convention from every other field here.

**Response `data`**: echoes the saved fields (only the ones sent).

Unknown keys are stripped by the schema, so a `profile_id` in the body is ignored; the row is always the session user's.

**Errors**: `401` unauthenticated, or no profile row (was `200` until 2026-10-14) · `422` unparseable body, a non-boolean value, or no known field · `500` write failure

---

## 6. Reports and Incidents

### GET /api/reports

**File**: `src/app/api/reports/route.ts`
**Roles**: CSO

**Query params**: `shift_id` (uuid) · `from` / `to` (ISO date or timestamp) · `limit` (positive integer, default 20, clamped to 50) · `cursor` (a `generated_at` timestamp from `next_cursor`)

**Response `data`**: `{ "reports": [...], "next_cursor": "<opaque>" }`

**Errors**: `422 Invalid query parameters` for any malformed param (since 2026-10-15) · `500` query failure, with a correlation reference

---

### POST /api/reports/generate

**File**: `src/app/api/reports/generate/route.ts`
**Roles**: CSO
**RPC**: `generate_shift_report(shift_id)`

| Field      | Type            | Required |
| ---------- | --------------- | -------- |
| `shift_id` | `string` (uuid) | yes      |

The `generate_shift_report` RPC creates the immutable `shift_reports` placeholder row (uniqueness guard + audit entry). The route then collects the shift's audit events, calls Gemini via `src/lib/ai/reports/` with the structured prompt, and persists `{ markdown, timeline, metadata }` to the row through the admin client (RLS blocks direct UPDATE). Falls back to a deterministic template when Gemini is unavailable, so generation always succeeds.

The generated report body, event timeline, immutable comments, and the "Generated by AI from shift event data" disclosure render at `/cso/reports/[id]`, which reads `shift_reports` + `shift_report_comments` directly via RLS (no separate read endpoint).

**Pending placeholders are adopted, not rejected.** The `daily-shift-summary` pg_cron job inserts an empty `markdown = 'PENDING_GENERATION'` row via `schedule_pending_shift_report()` before any generation runs. When a row like that already exists for the shift, this route reuses it and skips the RPC (which would raise `CONFLICT`), writing the `SHIFT_REPORT_INITIATED` audit entry directly via `src/lib/audit/` instead. Only a row with real content produces the 409 below. Without this, a scheduled report could never be completed by anyone — see `docs/CHANGELOG.md` 2026-09-04. The "Generate now" button on a pending `/cso/reports/[id]` calls this route.

Generation and persistence are shared with `POST /api/cron/shift-report` through `fillShiftReport` in `src/lib/ai/reports/generate.ts`.

**Response `data`**: `{ "report_id": "<uuid>", "generated_at": "<iso>" }`. Returns `201`.

**Errors**: `404` shift not found · `409` a **generated** report already exists for this shift (a pending placeholder is adopted instead) · `500` generation or persistence failure, with a correlation reference

---

### POST /api/reports/[id]/comments

**File**: `src/app/api/reports/[id]/comments/route.ts`
**Roles**: CSO
**RPC**: `add_report_comment(report_id, text)`

| Field  | Type     | Required |
| ------ | -------- | -------- |
| `text` | `string` | yes      |

Comment is immutable after insert.

**Response `data`**: `{ "comment_id": "<uuid>", "created_at": "<iso>" }`. Returns `201`.

**Errors**: `401` unauthenticated or no profile · `403` not CSO · `404` report not found, including an `[id]` that is not a UUID (it used to reach the RPC and fail as a `500`) · `422` empty `text` · `500` with a correlation reference

---

### GET /api/incidents

**File**: `src/app/api/incidents/route.ts`
**Roles**: CSO

Read-only. No update or delete endpoint exists — the incident log is append-only.

**Query params**: `type` (`incident_type`) · `severity` (`LOW | MEDIUM | HIGH`) · `status` (`OPEN | RESOLVED | ESCALATED`) · `from` / `to` (ISO date or timestamp, on `occurred_at`) · `limit` (positive integer, default 50, clamped to 100) · `cursor` (a `logged_at` timestamp from `next_cursor`)

**Response `data`**: `{ "incidents": [...], "next_cursor": "<opaque>" }`

**Errors**: `422 Invalid query parameters` for an unknown enum value or a malformed date, limit or cursor (since 2026-10-15; these were cast straight into the query and answered `500`) · `500` query failure, with a correlation reference

---

### POST /api/incidents

**File**: `src/app/api/incidents/route.ts`
**Roles**: CSO, VERIFIER

| Field               | Type                                                                                     | Required |
| ------------------- | ---------------------------------------------------------------------------------------- | -------- |
| `type`              | `'MISSING_KEY' \| 'SUSPICIOUS_ACTIVITY' \| 'EQUIPMENT_FAULT' \| 'PROCEDURAL' \| 'OTHER'` | yes      |
| `severity`          | `'LOW' \| 'MEDIUM' \| 'HIGH'`                                                            | yes      |
| `description`       | `string`                                                                                 | yes      |
| `related_key_id`    | `string` (uuid)                                                                          | no       |
| `related_person_id` | `string` (uuid)                                                                          | no       |
| `occurred_at`       | `string` (ISO timestamptz)                                                               | yes      |

**RPC**: `log_incident(type, severity, description, occurred_at, related_key_id?, related_person_id?)`

Inserts the incident (status `OPEN`, filed against the open shift if there is one, `reference` generated by the database) and writes an `INCIDENT_LOGGED` audit entry in the same transaction, with the logger taken from the session. Returns `201`.

Severity changes nothing about how the incident is handled. The `INCIDENT_LOGGED` entry reaches the CSO dashboard live through its `audit_log` Realtime subscription (the events chart, under "Anomaly"), whatever the severity. No shift report is generated per incident — reports are per shift (`POST /api/reports/generate` and the 18:00 cron). An earlier version of this entry claimed a `HIGH` incident triggered immediate AI report generation and a dedicated Realtime alert; the route never did either.

**Response `data`**: `{ "incident_id": "<uuid>", "reference": "INC-2026-0042" }`

**Errors**: `401` unauthenticated or no profile · `403` not CSO/VERIFIER · `422` validation (including a whitespace-only description) · `500` RPC failure, with a correlation reference

---

## 6a. Scheduled (cron)

All five cron routes are wrapped in `route({ auth: 'cron' })` (batch 5, 2026-10-14). The wrapper checks `Authorization: Bearer ${CRON_SECRET}` before the handler runs: an unset `CRON_SECRET` is a `500` with a ref, a missing or wrong header a `401 Unauthorized`, and no query runs in either case. The secret is compared in constant time; until 2026-10-14 each route compared it with `!==`. Cron handlers get no Supabase client from the wrapper and create the service-role admin client themselves. A failed query is a `500 "Internal error. Ref: <ref>"` whose only content is the ref. An uncaught throw (for example a misconfigured service-role key) is now the same enveloped `500`; it used to escape as Next's bare, unenveloped `500`. pg_cron only reads the HTTP status. Since 2026-10-14 (`fix/cron-gaps`) `weekend-reminders` reports the same four counters as `overdue-reminders`, and `daily-digest` answers a failed preferences read with a ref'd `500` instead of `200 { sent: 0 }`.

**Claim, then send.** Both reminder routes stamp their rows _before_ sending, with one conditional PostgREST update: `UPDATE requests SET <stamp> = now WHERE <stamp> IS NULL AND <due> RETURNING id`. Postgres locks each row it updates and, under READ COMMITTED, re-checks the `WHERE` once a concurrent writer commits, so two overlapping runs can never both get the same row back. Only the rows a run claimed are sent; a failed send's stamp is set back to `null` (only where it still holds this run's value), so a later run retries it. Until 2026-10-14 they selected, sent, then stamped, so a failed stamp or an overlapping run re-sent the reminder. The trade is at-most-once instead of at-least-once: a crash between claim and send, or a failed release, leaves a row stamped with no email (the release failure is logged with the ids).

### POST /api/cron/weekend-reminders

**File**: `src/app/api/cron/weekend-reminders/route.ts`
**Roles**: SYSTEM (pg_cron; no user session)

Not user-facing. Called by the `weekend-code-reminders` pg_cron job at 06:00 UTC on Sat/Sun. Authenticated by a shared bearer secret (`Authorization: Bearer ${CRON_SECRET}`), not a session; uses the service-role admin client. Finds `APPROVED` weekend requests due today (registered and guest) with `reminder_sent_at IS NULL`, emails each requester a reminder to mint their collection code via `notify({ type: 'WEEKEND_REMINDER' })` (registered → `/requester/dashboard`, guest → `/weekend-access/[token]`), claiming each row by stamping `reminder_sent_at` before sending (see "Claim, then send" above). A row stays stamped once handled: sent, suppressed (no current case), or with no recipient address. Only a failed send is released, so a later run the same morning retries it. Until 2026-10-14 `suppressed` and `no_recipient` were counted as `failed` and left unstamped. No collection code is included — the code is always minted on the day.

No request body.

**Response `data`**: `{ "sent": 2, "suppressed": 0, "no_recipient": 0, "failed": 0 }` (was `{ "sent", "failed" }` until 2026-10-14)

**Errors**: `401` missing/incorrect bearer secret · `500` `CRON_SECRET` not configured or query failure

The pg_cron job reads its bearer secret from Supabase Vault (`weekend_cron_secret`), created once out of band with the same value as `CRON_SECRET` (see `supabase/migrations/20260622134716_weekend_code_reminders.sql`).

---

### POST /api/cron/overdue-reminders

**File**: `src/app/api/cron/overdue-reminders/route.ts`
**Roles**: SYSTEM (pg_cron; no user session)

Not user-facing. Called by the `overdue-key-check` pg_cron job hourly, right after `mark_key_overdue()` in the same job (see `supabase/migrations/20260812110000_requester_notifications.sql`) — reuses the `weekend_cron_secret` Vault bearer secret. Finds `KEY_ISSUED` requests (registered and guest) whose `return_deadline` has passed with `overdue_reminder_sent_at IS NULL`, claims them by stamping `overdue_reminder_sent_at` (see "Claim, then send" above), and calls `notify({ type: 'OVERDUE_REMINDER' })` for each — which applies a registered requester's `notification_preferences.overdue_email` (default true if no row); guests have no preference and always receive it. A row stays stamped once handled: sent, suppressed by preference, or with no recipient address (re-querying those every hour helps no one). Only a failed send is released, to retry next hour.

No request body.

**Response `data`**: `{ "sent": 1, "suppressed": 1, "no_recipient": 0, "failed": 0 }`

**Errors**: `401` missing/incorrect bearer secret · `500` `CRON_SECRET` not configured or query failure

---

### POST /api/cron/daily-digest

**File**: `src/app/api/cron/daily-digest/route.ts`
**Roles**: SYSTEM (pg_cron; no user session)

Not user-facing. Called by the `daily-digest` pg_cron job at 07:00 UTC daily — same `CRON_SECRET` bearer-auth pattern as the other two cron routes. Finds every `ACTIVE` `DEAN`/`CSO` profile with `notification_preferences.digest_email = true` (absence of a row means **not** opted in — the opposite default from every other preference column) and, for each, calls the `get_digest_stats` RPC (building-wide once for every CSO, per-unit for each Dean). The building-wide result is shared, and so is its failure: if that one call fails, every CSO counts as `failed` and it is not retried per CSO (until 2026-10-14 it was) covering the last 24 hours. Skips sending entirely for a recipient whose window has nothing to report in any relevant field — an always-firing digest with all zeros trains people to ignore it.

No request body.

**Response `data`**: `{ "sent": 1, "skipped": 1, "failed": 0 }`

**Errors**: `401` missing/incorrect bearer secret · `500` `CRON_SECRET` not configured, or the profiles or `notification_preferences` query failed

---

### POST /api/cron/shift-report

**File**: `src/app/api/cron/shift-report/route.ts`
**Roles**: SYSTEM (pg_cron; no user session)

Not user-facing. Called by the `daily-shift-summary` pg_cron job at 18:00 UTC daily, right after `schedule_pending_shift_report()` in the same job (see `supabase/migrations/20260904103000_shift_report_cron_generation.sql`) — reuses the `weekend_cron_secret` Vault bearer secret, same pattern as the other cron routes. Generating a report means calling Gemini, which plpgsql cannot do, so the SQL function schedules the placeholder and this route fills it in.

Selects `shift_reports` rows still at `markdown = 'PENDING_GENERATION'`, fewest failed attempts first and then oldest (capped at 5 per invocation — one Gemini call each, inside pg_cron's 25s HTTP timeout) and generates each through the shared `fillShiftReport` helper in `src/lib/ai/reports/generate.ts`, the same code path `POST /api/reports/generate` uses. Because it drains by row rather than by "today's shift", placeholders stranded before this route existed are picked up too. One row failing is logged and skipped, not fatal to the rest. The failure is also recorded on the placeholder's `metadata` (`generation_attempts`, `last_generation_error` truncated to 200 characters, `last_attempt_at`), guarded on the row still being `PENDING_GENERATION`; a successful generation replaces `metadata` wholesale. A placeholder that keeps failing therefore sinks behind fresh ones, and after 5 failed attempts the cron skips it (logged as a warning) — the CSO's "Generate now" (`POST /api/reports/generate`) still adopts it. Until 2026-10-14 the oldest placeholders were always picked first, so five that always failed blocked the queue for good. No schema change: `metadata` is `jsonb`.

No request body.

**Response `data`**: `{ "generated": 2, "failed": 0 }`

**Errors**: `401` missing/incorrect bearer secret · `500` `CRON_SECRET` not configured or query failure

---

### POST /api/cron/audit-export

**File**: `src/app/api/cron/audit-export/route.ts`
**Roles**: SYSTEM (pg_cron; no user session)

Not user-facing. Called by the `audit-log-export` pg_cron job at 02:00 UTC daily — same `CRON_SECRET` bearer-auth pattern as the other cron routes. Exports `audit_log` rows to Vercel Blob (`access: 'private'`), a store genuinely outside the Supabase project, as newline-delimited JSON partitioned by UTC calendar day (`audit-log/YYYY-MM-DD.ndjson`). Only exports fully-completed days — a day is exported exactly once, since Blob has no append. Progress is tracked in the separate `audit_export_state` singleton table (`docs/DATABASE.md`), never on `audit_log` itself, which stays append-only and immutable (RLS denies UPDATE/DELETE for every role). Capped at 20,000 rows per invocation; the watermark defaults to year 2000, so the first run backfills the whole table.

No request body.

**Response `data`**: `{ "exported_days": 1, "exported_rows": 42 }`

**Errors**: `401` missing/incorrect bearer secret · `500` `CRON_SECRET`/`BLOB_READ_WRITE_TOKEN` not configured, or query/upload failure

---

## 7. AI

### GET /api/ai/risk-alerts

**File**: `src/app/api/ai/risk-alerts/route.ts`
**Roles**: CSO

Returns active high-risk access patterns: requests with `risk_tier = 'HIGH'` in the last 24 hours that have not been resolved. Read-only; the risk engine runs at request-submit time, not on this endpoint.

**Response `data`**: `{ "alerts": [...] }`

---

### GET /api/ai/signature-alerts

**File**: `src/app/api/ai/signature-alerts/route.ts`
**Roles**: CSO

Returns two independent lists of held signature/stamp mismatches. Read-only.

- `alerts` — weekend requests currently held on `PENDING_HOD` with an unresolved `SIGNATURE_MISMATCH` audit entry (written by `POST /api/requests/hod-decision` when the request's stored letter and/or stamp fails verification against the Dean's reference). A request drops off this list once the CSO approves or declines it on `POST /api/requests/hod-decision`. The route reads the `PENDING_HOD` requests first, then the latest `SIGNATURE_MISMATCH` entry for each of them; until 2026-10-14 it read the 200 newest entries first, so an older request that was still held fell off the list.
- `reference_replacements` — Dean signature/stamp reference-replacement uploads currently held (written by `POST /api/profile/signature`). Sourced from `pending_signature_references` row existence rather than audit-log scraping (there is no request status to key off here). An entry drops off this list once the CSO resolves it via `POST /api/admin/signature-references/resolve`.

**Response `data`**: `signature` and/or `stamp` is present on an `alerts` entry depending on which check(s) failed — never both null.

```json
{
  "alerts": [
    {
      "id": "<uuid>",
      "requested_for": "2026-07-04",
      "occurred_at": "<iso>",
      "signature": {
        "ref_url": "<url>",
        "submitted_url": "<url>",
        "mismatch_pct": 22.5
      },
      "stamp": {
        "ref_url": "<url>",
        "submitted_url": "<url>",
        "mismatch_pct": 61.0
      },
      "threshold_pct": 55,
      "requester": {
        "id": "<uuid>",
        "full_name": "Dr. Bakare",
        "institutional_email": "..."
      },
      "key": {
        "id": "<uuid>",
        "code": "NS-304",
        "room_name": "Senate Hall A",
        "zone": "NEW_SENATE"
      }
    }
  ],
  "reference_replacements": [
    {
      "profile_id": "<uuid>",
      "type": "signature",
      "dean_name": "Dr. Bakare",
      "submitted_at": "<iso>",
      "mismatch_pct": 62.0,
      "threshold_pct": 55,
      "current_ref_url": "<url>",
      "pending_url": "<url>"
    }
  ]
}
```

---

### POST /api/ai/verify-signature

**File**: `src/app/api/ai/verify-signature/route.ts`
**Roles**: SYSTEM — not session-authenticated. A diagnostic/calibration endpoint for exercising the signature pipeline over HTTP (e.g. from Postman); nothing in the app calls it. `POST /api/requests/hod-decision` and the one-click Dean decision run `verifySignature()` from `src/lib/ai/signature/verifier.ts` in-process instead (see `docs/AI.md` §3).

**Disabled unless `SIGNATURE_DIAGNOSTIC_SECRET` is set.** The caller sends that value in the `x-internal-secret` header; it is compared in constant time (`secretMatches` in `src/lib/http/route.ts`, the same SHA-256 + `timingSafeEqual` check `cronAuth` uses). An unset secret, or one shorter than 32 characters, fails closed with the same `403` as a wrong one — leave it unset in production. Until 2026-10-15 the header was compared with `===` against `SUPABASE_SERVICE_ROLE_KEY`, so the RLS-bypassing key travelled as an HTTP header; that key is no longer accepted. The secret is checked before the body is read.

| Field                     | Type            | Required |
| ------------------------- | --------------- | -------- |
| `hod_id`                  | `string` (uuid) | yes      |
| `submitted_signature_url` | `string`        | yes      |

`submitted_signature_url` must be a Supabase Storage object URL in the `weekend-letters` or `hod-signatures` bucket (checked with `parseStorageUrl`). Anything else — an arbitrary URL, a `passport-photos` object, a nested or traversal path — is a `422`, and nothing is fetched. Both images are read through the Storage API with the admin client, never over HTTP.

Retrieves the Dean's reference signature, runs Sharp preprocessing on both images, and runs Pixelmatch. Returns the raw mismatch ratio and whether it passes `SIGNATURE_DIFF_THRESHOLD` (default 0.55, scored over the ink region — see `docs/AI.md` §3). Read-only: no audit entry.

**Response `data`**: `{ "mismatch_ratio": 0.04, "passed": true }`

**Errors**: `403` route disabled, or missing/incorrect `x-internal-secret` · `422` body fails validation (including a URL outside the two allowed buckets), or the Dean has no `signature_ref_url` on file · `500` image fetch or verification failure, with a correlation reference

---

## 7a. Storage

### GET /api/storage/object

**File**: `src/app/api/storage/object/route.ts`
**Roles**: ALL (authenticated) — authorised per bucket, see below

The authenticated read path for every private storage bucket. Returns the object's **bytes**, not a JSON envelope — it is consumed directly as `<img src="/api/storage/object?...">`.

**Query params**: `bucket` (`passport-photos` | `hod-signatures` | `weekend-letters`) · `path` (must match `{uuid}/{filename}` — one folder segment, one flat filename; nested paths and traversal are rejected) · `v` (optional cache-buster, ignored by the handler)

| Bucket            | Who may read                                                              |
| ----------------- | ------------------------------------------------------------------------- |
| `hod-signatures`  | The owning Dean, and the CSO                                              |
| `passport-photos` | The subject of the photo, plus any CSO, DEAN, or VERIFIER                 |
| `weekend-letters` | CSO only — the Dean's unit-scoped path is `GET /api/requests/[id]/letter` |

Ownership is derived from the object path's first segment, which is always the profile id (or request id) the object belongs to.

Bytes are streamed behind the session cookie rather than handed out as signed URLs: these images render in dashboards that stay open for a whole shift, so a signed URL would expire mid-shift and leave broken images, and would remain a bearer token for its whole lifetime. A proxied request is re-authorised every time and stops working the moment the session does. A `DEACTIVATED` profile is refused with `401`, as in `route()`.

**Response headers.** The content type is taken from the object's leading bytes (`src/lib/storage/upload-type.ts`), never from the type stored with the object, which is whatever the uploader declared. Built by `objectResponseHeaders` in `src/lib/storage/object-headers.ts`:

| Bytes are         | `Content-Type`                            | `Content-Disposition` |
| ----------------- | ----------------------------------------- | --------------------- |
| PNG / JPEG / WebP | `image/png` / `image/jpeg` / `image/webp` | `inline`              |
| PDF               | `application/pdf`                         | `attachment`          |
| anything else     | `application/octet-stream`                | `attachment`          |

Every response also carries:

- `Content-Security-Policy: default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox` — ignored for an `<img>`, but if the URL is opened directly the document gets an opaque origin, no script and no loads.
- `X-Content-Type-Options: nosniff`
- `Cache-Control: private, max-age=300, must-revalidate`

A PDF is an attachment because inline it would render on the app origin, and Chrome will not render a PDF under `sandbox` at all; nothing embeds one from this route (Deans and the CSO view letters through Supabase signed URLs, below). Until 2026-10-14 every object was served `inline` under its stored type, so an SVG photo or an HTML file labelled as a signature ran script on the app origin when opened. Sniffing on the way out protects objects stored before the upload fix as well as new ones.

**Uploads.** Every server-side upload path (`auth/register`, `auth/activate-hod`, `profile/photo`, `profile/signature`, `public/weekend-request`) runs `checkUpload` from `src/lib/storage/upload-type.ts` on the file's bytes and stores the detected content type and extension; the declared type and filename are never used. Accepted: PNG, JPEG, WebP, and PDF only for weekend letters. SVG is accepted nowhere. The requester's weekend letter and stamp go straight from the browser to Storage; the sheet runs the same check to label them, and `POST /api/requests/submit` reads each object back and refuses one that is not an image. Bucket-level `allowed_mime_types` and a 5 MB `file_size_limit` back this up (`20261014110000_bucket_mime_types.sql`, `docs/DATABASE.md`).

**Signed URLs.** `GET /api/requests/[id]/letter` and `GET /api/public/dean-decision/[token]` hand out 5-minute Supabase signed URLs instead. Those are served by Supabase's own origin (`*.supabase.co`), not the app's, so a hostile document there cannot read the app's cookies or storage. Supabase serves them with the object's stored content type; what it does with a stored `text/html` or `image/svg+xml` (whether it forces a safe type or adds its own CSP) has not been verified. New letters can no longer be stored under such a type (the checks above and the bucket list); objects stored earlier could be, so see the check in `docs/CHANGELOG.md` 2026-10-14.

Callers never build these URLs by hand — `toProxyUrl` / `rewriteStorageUrls` in `src/lib/storage/object-url.ts` rewrite stored storage URLs at the response boundary, so every route listed in §2–§7 that carries a `photo_url`, `signature_ref_url`, `stamp_ref_url`, `ref_url`, `submitted_url`, `pending_url`, or `current_ref_url` returns a proxy URL rather than a raw Storage URL. The canonical Storage URL is what stays in the database column and in audit payloads.

**Response**: raw image/file bytes on success.

**Errors**: `401` unauthenticated · `403` role not permitted for that bucket · `404` object not found · `422` unknown bucket or malformed `path`

---

## 8. Ops

### GET /api/health

**File**: `src/app/api/health/route.ts`
**Roles**: ALL (unauthenticated) — no session, no cookies

Liveness probe for external uptime monitoring (e.g. UptimeRobot). The landing page is statically rendered and returns 200 even with Postgres completely down, so this route exists to issue a real query and fail when the database can't answer it. Uses the anon client — never the service role — and expects RLS to deny the query (zero rows for `anon` on `keys`); a genuine failure comes back as a Supabase error, not an empty result. No counts, identifiers, or row data appear in the response.

`status` is `"degraded"` (still HTTP 200) when the round trip exceeds 1000ms, `"ok"` otherwise.

**Response `data`**: `{ "status": "ok", "database": "up", "latency_ms": 42, "timestamp": "<iso>" }`

**Errors**: `503` database unreachable, or the Supabase client threw (e.g. missing env vars in a misconfigured deploy)

---

## RPC cross-reference

| RPC                                   | Called by route                                      | Also writes audit entry |
| ------------------------------------- | ---------------------------------------------------- | ----------------------- |
| `create_request`                      | POST /api/requests/submit                            | yes                     |
| `cancel_request`                      | POST /api/requests/cancel                            | yes                     |
| `cso_decide_request`                  | POST /api/requests/cso-decision                      | yes                     |
| `update_user_profile`                 | PATCH /api/admin/users/[id]                          | yes                     |
| `deactivate_user`                     | PATCH /api/admin/users/[id]/revoke                   | yes                     |
| `reinstate_user`                      | POST /api/admin/users (reinstatement)                | yes                     |
| `record_invite_resent`                | POST /api/admin/users, …/[id]/resend-invite          | yes                     |
| `create_key`                          | POST /api/admin/keys                                 | yes                     |
| `set_signature_reference`             | POST /api/profile/signature (service role)           | yes                     |
| `hold_signature_reference`            | POST /api/profile/signature (service role)           | yes                     |
| `issue_key`                           | POST /api/requests/collect                           | yes                     |
| `generate_weekend_code`               | POST /api/requests/weekend-code                      | yes                     |
| `expire_request`                      | POST /api/requests/expire                            | yes                     |
| `dismiss_expired_request`             | POST /api/requests/dismiss                           | yes                     |
| `request_return`                      | POST /api/requests/request-return                    | yes                     |
| `request_return_guest`                | POST /api/public/weekend-request/[token]/return-code | yes                     |
| `return_key`                          | POST /api/keys/return                                | yes                     |
| `mark_key_lost`                       | POST /api/keys/mark-lost                             | yes                     |
| `log_incident`                        | POST /api/incidents                                  | yes                     |
| `approve_weekend`                     | POST /api/requests/hod-decision                      | yes                     |
| `approve_guest_weekend`               | POST /api/requests/hod-decision                      | yes                     |
| `decline_weekend`                     | POST /api/requests/hod-decision                      | yes                     |
| `nominate_collector`                  | POST /api/admin/authorisations                       | yes                     |
| `remove_collector`                    | DELETE /api/admin/authorisations/[k]/[r]             | yes                     |
| `create_guest_weekend_request`        | POST /api/public/weekend-request                     | yes                     |
| `check_rate_limit`                    | POST /api/public/weekend-request (service role)      | no — not an action      |
| `generate_guest_weekend_code`         | POST /api/public/weekend-request/[token]/code        | yes                     |
| `expire_guest_request`                | POST /api/public/weekend-request/[token]/expire      | yes                     |
| `acknowledge_shift_handover`          | POST /api/shifts/handover                            | yes — per key           |
| `generate_shift_report`               | POST /api/reports/generate                           | yes                     |
| `add_report_comment`                  | POST /api/reports/[id]/comments                      | yes                     |
| `provision_user`                      | POST /api/admin/users                                | yes                     |
| `update_risk_config`                  | PATCH /api/admin/risk-rules                          | yes                     |
| `update_operational_config`           | PATCH /api/admin/operational-config                  | yes                     |
| `resolve_pending_signature_reference` | POST /api/admin/signature-references/resolve         | yes                     |
| `mark_key_overdue`                    | cron only (`pg_cron`, hourly) — no route caller      | yes — per key           |
| `schedule_pending_shift_report`       | cron only (`pg_cron`, daily 18:00) — no route caller | yes — when a CSO exists |

All RPCs are defined in `supabase/migrations/`. See `docs/DATABASE.md` for parameter signatures.

---

## Error code reference

| Code | Meaning in SmartKey                                                       |
| ---- | ------------------------------------------------------------------------- |
| 200  | Success with body                                                         |
| 201  | Resource created (POST that inserts)                                      |
| 204  | Success, no body (DELETE)                                                 |
| 401  | No valid session — redirect to login                                      |
| 403  | Wrong role or RLS violation                                               |
| 404  | Resource not found                                                        |
| 409  | State conflict (already issued, already cancelled, slots full)            |
| 422  | Zod validation failure — `error` field lists the failing fields           |
| 429  | Rate limited (guest form only) — `Retry-After` header gives the wait      |
| 500  | RPC or internal failure — `error` field contains a correlation reference  |
| 503  | External dependency unavailable (Gemini quota exhausted with no fallback) |
