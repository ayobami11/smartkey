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

---

## Auth conventions

- All routes except `/api/auth/login` and `/api/auth/reset-password` require a valid Supabase session JWT (verified via `getUser()`, never `getSession()`).
- Role is read from `profiles.role` after the session is confirmed, not from the JWT claim alone.
- RLS is the authoritative enforcement layer; route-level role checks are defence-in-depth.
- The service-role key is used only in Edge Functions, never in browser-reachable routes.

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

**Errors**: `401` no valid activation session · `422` password fails the `src/lib/validation/primitives.ts` rule, or missing photo · `413` photo over 5MB

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

**Response `data`**: `{ "profile_id": "<uuid>", "redirect": "/dean" }`

**Errors**: `401` no valid activation session · `422` validation · `413` image too large

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
**RPC**: `create_request(key_id, return_time, type, weekend_date?)`

| Field             | Type                       | Required                                                                                                                                                                   |
| ----------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `key_id`          | `string` (uuid)            | yes                                                                                                                                                                        |
| `type`            | `'WEEKDAY' \| 'WEEKEND'`   | yes                                                                                                                                                                        |
| `return_deadline` | `string` (ISO timestamptz) | yes                                                                                                                                                                        |
| `weekend_date`    | `string` (ISO date)        | WEEKEND only                                                                                                                                                               |
| `letter_url`      | `string`                   | no — optional Dean-signature image the requester uploaded client-side to `weekend-letters`; persisted on the request row for later signature verification at Dean approval |

The RPC runs the risk engine, generates the code, and writes the audit entry atomically.

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

**Errors**: `403` requester not authorised for this key · `409` active request already exists for this key · `422` outside operational hours (weekend requests) · `500` RPC failure

For a `WEEKDAY` request, fires a fire-and-forget `sendCollectionCodeEmail` to the requester. For a `WEEKEND` request, fires a fire-and-forget `sendWeekendSubmittedEmail` to the key's unit's Dean (resolved via `getDeanRecipientForKey`) — no-op for Administration (`authoriser='CSO'`) keys, which have no Dean. When a Dean recipient does resolve, a `decision_token` is minted and persisted on the request first, and the email's `decisionLink` points at `/dean-decision/[token]` — the one-click Approve/Decline flow (see "Public one-click Dean decision" below). Neither send can fail the response.

---

### GET /api/requests/my

**File**: `src/app/api/requests/my/route.ts`
**Roles**: REQUESTER

**Query params**: `status` (optional, comma-separated enum values) · `limit` · `cursor`

**Response `data`**: `{ "requests": [...], "next_cursor": "<opaque>" }`

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
**RPC**: `approve_weekend(request_id, hod_id, note?, signature_verified?, signature_mismatch_pct?, cso_override?)`, `approve_guest_weekend(request_id, hod_id, key_id, note?)`, or `decline_weekend(request_id, hod_id, note?, cso_override?)`

| Field                     | Type                       | Required                             |
| ------------------------- | -------------------------- | ------------------------------------ |
| `request_id`              | `string` (uuid)            | yes                                  |
| `decision`                | `'APPROVED' \| 'DECLINED'` | yes                                  |
| `key_id`                  | `string` (uuid)            | guest approvals only                 |
| `note`                    | `string`                   | no                                   |
| `submitted_signature_url` | `string` (url)             | no — triggers signature verification |
| `submitted_stamp_url`     | `string` (url)             | no — triggers stamp verification     |
| `cso_override`            | `boolean`                  | CSO resolving a held mismatch only   |

For approvals, the route runs pixel-level verification for whichever of `submitted_signature_url` / `submitted_stamp_url` is present — independent checks; either, both, or neither may run (see `docs/AI.md` §3). If **either** check fails its threshold, the approval is **held** — the RPC is never called — and a `SIGNATURE_MISMATCH` audit entry is written instead, with a nested payload `{ signature: {ref_url, submitted_url, mismatch_pct} | null, stamp: {...} | null, threshold_pct }`. The response in this case is `{ "request_id": "<uuid>", "status": "HELD_SIGNATURE_MISMATCH", "mismatches": { "signature"?: <number>, "stamp"?: <number> } }` (still HTTP 200 — this is not a route-level error; only the failing check(s) appear in `mismatches`). Alongside the audit entry, every `ACTIVE` CSO opted in to `notification_preferences.signature_mismatch_email` (default true) is emailed via `sendCsoSignatureMismatchEmail` (fire-and-forget; a send failure is logged, never surfaces to the Dean's response).

For an external (guest) request (`guest_id` set), the route requires a `key_id` in the body and calls `approve_guest_weekend` instead — the Dean assigns the key at approval, and both checks are skipped (guests have no Dean reference signature or stamp; the Dean reviews the uploaded letter manually). The decline path reuses `decline_weekend` unchanged.

The **CSO** may call this route for **Administration** requests (keys whose department `authoriser = 'CSO'`). The CSO path skips signature verification (no reference signature exists for the CSO). The RPC re-validates that the actor's role matches the target department's `authoriser`, so a Dean acting on an Administration key — or the CSO acting on a faculty key — is rejected with `403`.

The CSO may also resolve a **held faculty-key mismatch** by passing `cso_override: true` with `decision: 'APPROVED'` or `'DECLINED'`. The RPC only honours this when a `SIGNATURE_MISMATCH` audit entry already exists for the request — it is not a general bypass of the Dean-authoriser gate. See `GET /api/ai/signature-alerts` for how the CSO discovers these.

**Response `data`**: `{ "request_id": "<uuid>", "status": "APPROVED" | "DECLINED" | "HELD_SIGNATURE_MISMATCH" }` — note this is `"APPROVED"`/`"DECLINED"` (the `hod_decisions.decision` / request status the RPC actually sets), not `"CODE_ISSUED"` — no code is minted at Dean-decision time; the requester mints one later via `POST /api/requests/weekend-code`.

**Errors**: `403` request not in Dean's faculty, or `cso_override` used without a matching mismatch on record · `409` already decided · `422` validation

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

CSO intervention on a high-risk `CODE_ISSUED` request surfaced by `cso-queue` above — not an approval gate every request passes through. `decision: 'DECLINED'` cancels the request (`CODE_ISSUED` → `CANCELLED`, admin client, audit `REQUEST_DECLINED_CSO`); `decision: 'APPROVED'` makes no state change (a no-op acknowledgement that the CSO has reviewed and is letting it proceed), audit `REQUEST_APPROVED_CSO`.

| Field        | Type                       | Required                                                         |
| ------------ | -------------------------- | ---------------------------------------------------------------- |
| `request_id` | `string` (uuid)            | yes                                                              |
| `decision`   | `'APPROVED' \| 'DECLINED'` | yes                                                              |
| `note`       | `string`                   | no — accepted by the schema but not currently persisted anywhere |

**Response `data`**: `{ "request_id": "<uuid>", "status": "CANCELLED" | "CODE_ISSUED" }` (`CANCELLED` on decline, unchanged `CODE_ISSUED` on approve)

**Errors**: `401` unauthenticated · `403` not CSO · `422` validation

---

### GET /api/requests/live-queue

**File**: `src/app/api/requests/live-queue/route.ts`
**Roles**: VERIFIER

Returns all requests with `status = 'CODE_ISSUED'`, ordered by `created_at` ascending. This is the initial load for the verifier dashboard; ongoing updates come via Supabase Realtime.

**Response `data`**: `{ "requests": [...] }`

---

### POST /api/requests/collect

**File**: `src/app/api/requests/collect/route.ts`
**Roles**: VERIFIER
**RPC**: `issue_key(request_id, verifier_id)`

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

**Errors**: `404` code not found or expired · `409` key already issued · `422` validation

---

### POST /api/requests/cancel

**File**: `src/app/api/requests/cancel/route.ts`
**Roles**: REQUESTER

| Field        | Type            | Required |
| ------------ | --------------- | -------- |
| `request_id` | `string` (uuid) | yes      |

Cancellable from any pre-collection state the requester owns: `CODE_ISSUED` (weekday code), or `PENDING_HOD` / `APPROVED` (a weekend request before its on-the-day code is minted — the manual escape hatch for an approved weekend request whose date passes). Writes audit entry.

**Response `data`**: `{ "request_id": "<uuid>", "status": "CANCELLED" }`

**Errors**: `403` not the requester's own request · `409` request not in cancellable state

---

### POST /api/requests/request-return

**File**: `src/app/api/requests/request-return/route.ts`
**Roles**: REQUESTER
**RPC**: `request_return(request_id, requester_id)`

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
**RPC**: `generate_weekend_code(request_id, requester_id)`

Requester-initiated. For an `APPROVED` weekend request, on the requested date only, mints a short-lived 6-digit collection code (10-min expiry) and moves the request to `CODE_ISSUED` — mirroring the weekday flow so the code is never long-lived. Writes a `CODE_ISSUED` audit entry.

| Field        | Type            | Required |
| ------------ | --------------- | -------- |
| `request_id` | `string` (uuid) | yes      |

**Response `data`**: `{ "request_id": "<uuid>", "code": "123456", "code_expires_at": "<iso>" }`

**Errors**: `403` not the requester's own request · `409` request not in APPROVED state · `422` before the requested date (TOO_EARLY) · `404` request not found

---

### POST /api/requests/expire

**File**: `src/app/api/requests/expire/route.ts`
**Roles**: REQUESTER
**RPC**: `expire_request(request_id, requester_id)`

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

#### POST /api/public/weekend-request

**File**: `src/app/api/public/weekend-request/route.ts`
**Roles**: ALL (unauthenticated)
**RPC**: `create_guest_weekend_request(full_name, email, phone, id_type, id_number, department_id, weekend_date, return_deadline, letter_url, requested_room)`

Multipart form. Uploads the Dean authorisation letter to the `weekend-letters` bucket, creates the guest + request (`PENDING_HOD`, no code), and emails the status link to the guest (via the shared email sender in `src/lib/email/`). Also fires a fire-and-forget `sendWeekendSubmittedEmail` to the target unit's Dean (resolved via `getDeanRecipientForUnit`, `department_id`) — no-op for Administration units. When a Dean recipient does resolve, a `decision_token` is minted and persisted on the request first, and the email's `decisionLink` points at `/dean-decision/[token]` with `isGuest: true` (renders the "External" badge) — the same one-click Approve/Decline flow as registered requests (see "Public one-click Dean decision" below), except approving here requires the Dean to also pick a key on that page. Neither send can fail the request. Returns `201`.

| Field                | Type                       | Required |
| -------------------- | -------------------------- | -------- |
| `full_name`          | `string`                   | yes      |
| `email`              | `string` (email)           | yes      |
| `phone`              | `string`                   | no       |
| `id_document_type`   | `string`                   | yes      |
| `id_document_number` | `string`                   | yes      |
| `department_id`      | `string` (uuid)            | yes      |
| `requested_room`     | `string` (max 200)         | yes      |
| `weekend_date`       | `string` (ISO date)        | yes      |
| `return_deadline`    | `string` (ISO timestamptz) | yes      |
| `letter`             | `File` (image/PDF)         | yes      |

**Response `data`**: `{ "access_token": "<uuid>", "request_id": "<uuid>" }`

**Errors**: `404` department not found · `422` validation · `413` letter too large

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
**RPC**: `generate_guest_weekend_code(access_token)`

Mints a short-lived 6-digit collection code (10-min expiry) for an `APPROVED` guest request, on the requested date only, and moves it to `CODE_ISSUED`. Writes a `CODE_ISSUED` audit entry.

**Response `data`**: `{ "request_id": "<uuid>", "code": "123456", "code_expires_at": "<iso>" }`

**Errors**: `409` request not in APPROVED state · `422` before the requested date (TOO_EARLY) · `404` token not found

---

#### POST /api/public/weekend-request/[token]/return-code

**File**: `src/app/api/public/weekend-request/[token]/return-code/route.ts`
**Roles**: ALL (unauthenticated)
**RPC**: `request_return_guest(access_token)`

Guest analogue of `POST /api/requests/request-return`. Generates a 6-digit return code (15-minute expiry) for the guest's own `KEY_ISSUED` request so the verifier can confirm the handover. The request stays in `KEY_ISSUED`; the code is written to `requests.return_code` / `return_code_expires_at`. Writes a `RETURN_CODE_GENERATED` audit entry.

No request body.

**Response `data`**: `{ "return_code": "123456", "return_code_expires_at": "<iso>" }`

**Errors**: `404` token not found · `409` key not currently issued

---

#### POST /api/public/weekend-request/[token]/expire

**File**: `src/app/api/public/weekend-request/[token]/expire/route.ts`
**Roles**: ALL (unauthenticated)
**RPC**: `expire_guest_request(access_token)`

Fired automatically by the status page when the collection code's countdown reaches 0. Flips a genuinely-expired `CODE_ISSUED` request to `EXPIRED`, clears the code, and writes a `REQUEST_EXPIRED` audit entry — **except** for a weekend request whose requested date is today, which instead rolls back to `APPROVED` (so the guest can mint a fresh code) and writes `CODE_EXPIRED` instead. Idempotent — returns the current status with no error if the request already moved on.

**Response `data`**: `{ "request_id": "<uuid>", "status": "EXPIRED" }` (or `"APPROVED"` on the same-day weekend rollback above)

**Errors**: `409` code has not expired yet · `404` token not found

---

### GET /api/requests/[id]/letter

**File**: `src/app/api/requests/[id]/letter/route.ts`
**Roles**: DEAN, CSO

Returns a short-lived (5-minute) signed URL for a request's uploaded authorisation letter or stamp image, so the authoriser can preview it before deciding. The file lives in the private `weekend-letters` bucket; signing happens server-side with the admin client. Access is gated to the Dean whose unit owns the request (RLS plus a unit check) or the CSO (admin client, for Administration-routed requests).

**Query params**: `type` (`'letter' | 'stamp'`, default `'letter'`) — selects `letter_url` or `stamp_url` on the request row.

**Response `data`**: `{ "url": "<signed-url>" }`

**Errors**: `403` not a Dean/CSO, or not the request's unit · `404` request has no letter/stamp for the requested `type` · `500` signing failure

---

### Public one-click Dean decision (email Approve/Decline)

Lets a Dean act on a Dean-authorised weekend request straight from the "New weekend request" email — no login. Covers both **registered-requester** and **guest (external)** requests. Reuses the same `decideWeekendRequest` core as `POST /api/requests/hod-decision` (`src/lib/requests/decide-weekend.ts`), so verification, mismatch-holding, guest key-assignment, the CSO mismatch email, and the requester notification all behave identically to the dashboard flow. Scoped to Dean-authorised units only — Administration/CSO-routed requests (no submission email exists for those today) never receive a `decision_token` and so 404 here.

The email itself distinguishes the two: a guest submission renders a small cyan "External" badge next to the requester's name (`sendWeekendSubmittedEmail`'s `isGuest` param), matching the `GuestBadge` treatment already used on the CSO/Dean dashboards and on the confirmation page below.

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

`decidable` is `status === 'PENDING_HOD'` — the page renders Approve/Decline only when `true`; otherwise it renders the terminal state named by `status`. `available_keys` is only populated when `is_guest && decidable`; empty otherwise.

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

Re-resolves the **current** Dean of the request's unit at decision time (not an identity captured when the email was sent, so a Dean handover in between is handled correctly) — for a guest request the unit comes from `requested_unit_id` (no `key_id` exists yet); for a registered request, from the request's own `key_id`. Reads `letter_url`/`stamp_url` off the request row itself as the submitted signature/stamp for **registered** requests only (server-side source of truth — unlike the dashboard route, there is no client to supply these); guest requests never send these — same as the dashboard's guest-approval path, which reviews the letter manually with no reference signature to compare against. Then calls the same `decideWeekendRequest` core as `POST /api/requests/hod-decision`, which for a guest `APPROVED` decision calls `approve_guest_weekend` with the chosen `key_id`.

**Response `data`**: identical shape to `POST /api/requests/hod-decision` — `{ "request_id": "<uuid>", "status": "APPROVED" | "DECLINED" }`, or the held-mismatch shape `{ "request_id": "<uuid>", "status": "HELD_SIGNATURE_MISMATCH", "mismatches": {...}, "message": "..." }` (still HTTP 200; never reachable for a guest request, which has no reference signature to mismatch against).

**Errors**: `403` the unit is no longer Dean-authorised, or has no Dean · `404` token not found, or the request resolves to no unit · `409` request is no longer `PENDING_HOD` (already decided — the page refetches to show the real terminal state) · `422` validation, or (guest `APPROVED` only) no `key_id` supplied

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

Returns all requests with `status = 'KEY_ISSUED'` or `status = 'KEY_OVERDUE'`, joined with requester and key details.

**Query params**: `zone` (`NEW_SENATE | OLD_SENATE`) · `overdue_only` (`boolean`)

**Response `data`**: `{ "outstanding": [...] }`

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
      "return_deadline": "<iso>",
      "issued_at": "<iso>",
      "holder": { "full_name": "Dr. Bakare", "is_guest": false }
    }
  ]
}
```

`state` is one of `AVAILABLE` · `SPOKEN_FOR` · `OUT` · `OVERDUE` · `RETIRED`, derived in `src/lib/keys/availability.ts`:

- `RETIRED` — the key row's own status, and it wins over any request.
- `OUT` / `OVERDUE` — an active `KEY_ISSUED` request exists. `OVERDUE` is derived from `return_deadline < now`, not read from `keys.status` (which only flips on the hourly `mark_key_overdue()` cron), matching the fallback `GET /api/keys/out` already applies.
- `SPOKEN_FOR` — an active `PENDING_HOD` / `APPROVED` / `CODE_ISSUED` request exists. **`holder` is `null` here by design**: a code that may simply expire in ten minutes is not worth naming a colleague over.
- `AVAILABLE` — no active request.

`holder` is non-null only for `OUT` / `OVERDUE`, and carries `full_name` and `is_guest` (guests hold keys at weekends) — nothing else. The response deliberately contains **no `code`, no `return_code`, no `photo_url`, no `risk_tier`**; there is no `rewriteStorageUrls` call because no storage URL is selected. A requester is told who has the key, never shown their passport photo — that exists for desk identity verification.

**Scope and enforcement**. This is the only route that shows one requester another requester's activity, so note where the boundary lives. RLS is deliberately **not** widened: `requests_select` scopes a REQUESTER to `requester_id = auth.uid()`, and `requests` holds `code` and `return_code`, so a policy loose enough to expose a holder's name would expose live collection codes to every co-authorised requester. Instead the route reads past RLS with the admin client and applies its own check — the same pattern `GET /api/keys/out` uses. The scope is the caller's own `authorisations` rows, filtered in the handler on the session user's id. `authorisations_select_all` is `USING (true)`, so **RLS does not scope that read; the explicit `.eq('profile_id', user.id)` does**, and it must never be driven by a client-supplied parameter.

Read-only, so no audit entry — `audit_log` records consequential actions, not queries.

**Errors**: `401` unauthenticated or profile missing · `403` not a REQUESTER · `500` query failure (correlation ref in the error string)

---

### GET /api/keys/history

**File**: `src/app/api/keys/history/route.ts`
**Roles**: CSO, DEAN

**Query params**: `key_id` · `requester_id` · `from` (ISO date) · `to` (ISO date) · `limit` · `cursor`

Dean sees only their faculty's keys (RLS enforced). CSO sees all.

**Response `data`**: `{ "transactions": [...], "next_cursor": "<opaque>" }`

---

### POST /api/keys/mark-lost

**File**: `src/app/api/keys/mark-lost/route.ts`
**Roles**: CSO

| Field    | Type            | Required |
| -------- | --------------- | -------- |
| `key_id` | `string` (uuid) | yes      |
| `note`   | `string`        | yes      |

Sets key `status = 'RETIRED'`, creates an incident log entry of type `MISSING_KEY`, severity `HIGH`. Writes audit entry.

**Response `data`**: `{ "key_id": "<uuid>", "incident_id": "<uuid>" }`

---

## 4. User Administration

### POST /api/admin/users

**File**: `src/app/api/admin/users/route.ts`
**Roles**: CSO
**RPC**: `provision_user(name, email, role, department_id?)` — the RPC parameter keeps its historical `p_department_id` name but writes to `profiles.unit_id`

| Field                 | Type                                  | Required           |
| --------------------- | ------------------------------------- | ------------------ |
| `full_name`           | `string`                              | yes                |
| `institutional_email` | `string` (email)                      | yes                |
| `role`                | `'DEAN' \| 'VERIFIER' \| 'REQUESTER'` | yes                |
| `unit_id`             | `string` (uuid)                       | DEAN and REQUESTER |

Creates the profile, generates a 24-hour activation token, queues the invite email via Nodemailer (Gmail SMTP), and writes the audit entry — all inside the RPC.

**Response `data`**: `{ "profile_id": "<uuid>", "status": "PENDING_ACTIVATION" }`

**Errors**: `409` email already registered · `422` validation

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

No request body. Sets `profiles.status = 'DEACTIVATED'`. Supabase Auth session is invalidated immediately. Writes audit entry.

**Response `data`**: `{ "profile_id": "<uuid>", "status": "DEACTIVATED" }`

**Errors**: `404` user not found · `409` already deactivated

---

### POST /api/admin/users/[id]/resend-invite

**File**: `src/app/api/admin/users/[id]/resend-invite/route.ts`
**Roles**: CSO

No request body. Re-sends a fresh activation link for a user still `PENDING_ACTIVATION` (e.g. their original 24-hour link expired unused).

**Response `data`**: `{ "profile_id": "<uuid>", "status": "PENDING_ACTIVATION" }`

**Errors**: `404` user not found · `409` user is already `ACTIVE` or is `DEACTIVATED` (reinstate first)

---

### PATCH /api/admin/users/[id]

**File**: `src/app/api/admin/users/[id]/route.ts`
**Roles**: CSO

Edits an existing user's `full_name` and — for departmental roles (Dean, REQUESTER) — `unit_id`. Email and role are intentionally **not** editable here: the email is the auth login identity and chain-of-trust anchor, and role changes are out of scope. Writes a `USER_UPDATED` audit entry recording only the fields that actually changed. When a Dean moves faculty, the `units.hod_id` reverse link is kept in sync.

| Field       | Type            | Required                   |
| ----------- | --------------- | -------------------------- |
| `full_name` | `string`        | yes                        |
| `unit_id`   | `string` (uuid) | Dean and REQUESTER targets |

**Response `data`**: `{ "profile_id": "<uuid>", "full_name": "<name>", "unit_id": "<uuid|null>" }`

**Errors**: `404` user not found · `409` destination faculty already has a Dean · `422` validation / unit required / unit not found

---

### GET /api/admin/units

**File**: `src/app/api/admin/units/route.ts`
**Roles**: CSO

No query params. Returns every unit (faculty or Administration) with its Dean, a `has_hod` flag (`true` when an `ACTIVE` Dean is already assigned — used to grey out that unit in the Dean-role picker on `POST /api/admin/users`), and a `has_slot_today` flag (`true` when at least one non-retired key in the unit is currently `AVAILABLE`).

**Response `data`**: `{ "units": [...] }`

---

### POST /api/admin/keys

**File**: `src/app/api/admin/keys/route.ts`
**Roles**: CSO

| Field       | Type                                 | Required |
| ----------- | ------------------------------------ | -------- |
| `code`      | `string` (matches `^[A-Z0-9]+-\d+$`) | yes      |
| `zone`      | `'NEW_SENATE' \| 'OLD_SENATE'`       | yes      |
| `room_name` | `string`                             | yes      |
| `unit_id`   | `string` (uuid)                      | yes      |
| `key_count` | `integer` (1–20, default 1)          | no       |

Creates a new key record (status `AVAILABLE`). Returns `201`.

**Response `data`**: `{ "key_id": "<uuid>" }`

**Errors**: `403` not CSO · `422` validation

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

**Errors**: `403` key not in your scope (Dean on another faculty's key, or CSO/Dean on the wrong authoriser type) · `409` three slots already filled · `409` requester already authorised for this key

---

### DELETE /api/admin/authorisations/[key_id]/[requester_id]

**File**: `src/app/api/admin/authorisations/[key_id]/[requester_id]/route.ts`
**Roles**: Dean (faculty keys), CSO (Administration keys)
**RPC**: `remove_collector(key_id, requester_id)`

Removes a collector from a slot. Authoriser-aware via the `remove_collector` RPC (Dean for their faculty's keys, CSO for Administration keys). Writes audit entry.

**Response `data`**: `null` (204)

**Errors**: `403` key not in your scope · `404` authorisation not found

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

Returns the caller's own profile, including role-specific fields (`signature_ref_url`, `stamp_ref_url` for Deans) and the joined unit name. Backs every role's account-settings page.

**Response `data`**: `{ "profile": { "id", "full_name", "institutional_email", "role", "status", "photo_url", "signature_ref_url", "stamp_ref_url", "unit_id", "unit": { "id", "name" } } }`

**Errors**: `401` unauthenticated · `404` profile not found

---

### PATCH /api/profile/me

**File**: `src/app/api/profile/me/route.ts`
**Roles**: ALL (authenticated)

Only `full_name` is mutable here — email is managed by Supabase Auth, photo by `POST /api/profile/photo`, and a Dean's signature/stamp by `POST /api/profile/signature`.

| Field       | Type     | Required |
| ----------- | -------- | -------- |
| `full_name` | `string` | yes      |

**Response `data`**: `{ "full_name": "<name>" }`

**Errors**: `401` unauthenticated · `422` missing/blank full_name

---

### POST /api/profile/photo

**File**: `src/app/api/profile/photo/route.ts`
**Roles**: ALL (authenticated)

Multipart form; replaces the caller's own profile photo in the `passport-photos` bucket. One route serves every role's settings screen (the storage folder is keyed by user id, not a role namespace).

| Field   | Type                    | Required |
| ------- | ----------------------- | -------- |
| `photo` | `File` (image, max 5MB) | yes      |

**Response `data`**: `{ "photo_url": "<url>" }`

**Errors**: `401` unauthenticated · `422` missing file or not an image type · `413` over 5MB

---

### DELETE /api/profile/photo

**File**: `src/app/api/profile/photo/route.ts`
**Roles**: ALL (authenticated)

No request body. Removes the caller's own photo file(s) from storage and clears `photo_url`.

**Response `data`**: `null`

**Errors**: `401` unauthenticated

---

### POST /api/profile/signature

**File**: `src/app/api/profile/signature/route.ts`
**Roles**: DEAN

Replaces a Dean's signature or stamp reference image (post-onboarding). If a reference is already on file, the new upload is compared pixel-level against it via the same Sharp + Pixelmatch pipeline as `POST /api/ai/verify-signature` before the replacement is allowed.

| Field   | Type                     | Required |
| ------- | ------------------------ | -------- |
| `type`  | `'signature' \| 'stamp'` | yes      |
| `image` | `File` (image, max 5MB)  | yes      |

If the mismatch exceeds `SIGNATURE_DIFF_THRESHOLD`, the reference is **held, not replaced**: the new upload is stored at a separate `-pending` Storage path, a row is written to `pending_signature_references` (see `docs/DATABASE.md`), and a `SIGNATURE_MISMATCH` audit entry is written (`context: 'reference_replacement'`, including `pending_url`). The response reports the held state (still HTTP 200) and the current reference stays active in the meantime. The CSO reviews the pending upload against the current reference on `/cso/dashboard` (same "Signature mismatches" card as the weekend-request mismatches) and resolves it via `POST /api/admin/signature-references/resolve` — approve to replace the reference, or decline to discard the pending upload. Otherwise (verification passes) the reference is replaced immediately and a `SIGNATURE_REFERENCE_UPDATED` entry is written.

**Response `data`** (held): `{ "status": "HELD_SIGNATURE_MISMATCH", "mismatch_pct": <number>, "message": "..." }`
**Response `data`** (updated): `{ "status": "updated", "new_url": "<url>" }`

**Errors**: `401` unauthenticated · `403` not DEAN · `422` missing/invalid type or image · `413` over 5MB

---

### POST /api/admin/signature-references/resolve

**File**: `src/app/api/admin/signature-references/resolve/route.ts`
**Roles**: CSO
**RPC**: `resolve_pending_signature_reference(profile_id, type, decision, note?)`

Resolves a held reference-replacement mismatch from `POST /api/profile/signature` above. Mirrors `POST /api/requests/hod-decision`'s `cso_override` path for weekend-request mismatches, but for a Dean's own onboarded reference rather than a request. `decision: 'APPROVED'` replaces `profiles.signature_ref_url`/`stamp_ref_url` with the pending upload; `decision: 'DECLINED'` discards it. Either way the pending row is deleted. The RPC raises `NOT_FOUND` if there's no pending row for that `profile_id`/`type`.

| Field        | Type                       | Required |
| ------------ | -------------------------- | -------- |
| `profile_id` | `string` (uuid)            | yes      |
| `type`       | `'signature' \| 'stamp'`   | yes      |
| `decision`   | `'APPROVED' \| 'DECLINED'` | yes      |
| `note`       | `string`                   | no       |

**Response `data`**: `{ "status": "APPROVED" | "DECLINED", "new_url": "<url>" | null }` (`new_url` is the new reference URL on approval, `null` on decline)

**Errors**: `401` unauthenticated · `403` not CSO · `404` no pending reference for this profile/type · `422` validation

---

### GET /api/profile/notification-preferences

**File**: `src/app/api/profile/notification-preferences/route.ts`
**Roles**: ALL (authenticated) — shared by the Requester, Dean, and CSO settings UIs; each only reads the fields it displays

RLS-scoped direct read of the caller's own `notification_preferences` row. Returns defaults (all `true` except `digest_email`) if no row exists yet — a row is only created on first save, not on read.

**Response `data`**: `{ "key_issued_in_app": true, "overdue_email": true, "weekend_decided_email": true, "weekend_submitted_in_app": true, "weekend_submitted_email": true, "signature_mismatch_email": true, "digest_email": false }`

**Errors**: `401` unauthenticated · `500` read failure

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

**Errors**: `401` unauthenticated · `422` validation (empty body) · `500` write failure

---

## 6. Reports and Incidents

### GET /api/reports

**File**: `src/app/api/reports/route.ts`
**Roles**: CSO

**Query params**: `shift_id` · `from` (ISO date) · `to` (ISO date) · `limit` · `cursor`

**Response `data`**: `{ "reports": [...], "next_cursor": "<opaque>" }`

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

**Response `data`**: `{ "report_id": "<uuid>", "generated_at": "<iso>" }`

**Errors**: `409` a **generated** report already exists for this shift (a pending placeholder is adopted instead) · `500` generation or persistence failure, with a correlation reference

---

### POST /api/reports/[id]/comments

**File**: `src/app/api/reports/[id]/comments/route.ts`
**Roles**: CSO
**RPC**: `add_report_comment(report_id, text)`

| Field  | Type     | Required |
| ------ | -------- | -------- |
| `text` | `string` | yes      |

Comment is immutable after insert.

**Response `data`**: `{ "comment_id": "<uuid>", "created_at": "<iso>" }`

---

### GET /api/incidents

**File**: `src/app/api/incidents/route.ts`
**Roles**: CSO

Read-only. No update or delete endpoint exists — the incident log is append-only.

**Query params**: `type` · `severity` · `status` · `from` · `to` · `limit` · `cursor`

**Response `data`**: `{ "incidents": [...], "next_cursor": "<opaque>" }`

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

If `severity = 'HIGH'`, the AI shift-report generation is triggered immediately and a CSO dashboard alert is raised via Realtime. Returns `201`.

**Response `data`**: `{ "incident_id": "<uuid>", "reference": "INC-2026-0042" }`

---

## 6a. Scheduled (cron)

### POST /api/cron/weekend-reminders

**File**: `src/app/api/cron/weekend-reminders/route.ts`
**Roles**: SYSTEM (pg_cron; no user session)

Not user-facing. Called by the `weekend-code-reminders` pg_cron job at 06:00 UTC on Sat/Sun. Authenticated by a shared bearer secret (`Authorization: Bearer ${CRON_SECRET}`), not a session; uses the service-role admin client. Finds `APPROVED` weekend requests due today (registered and guest) with `reminder_sent_at IS NULL`, emails each requester a reminder to mint their collection code (registered → `/requester/dashboard`, guest → `/weekend-access/[token]`), and stamps `reminder_sent_at` so a retry never double-sends. No collection code is included — the code is always minted on the day.

No request body.

**Response `data`**: `{ "sent": 2, "failed": 0 }`

**Errors**: `401` missing/incorrect bearer secret · `500` `CRON_SECRET` not configured or query failure

The pg_cron job reads its bearer secret from Supabase Vault (`weekend_cron_secret`), created once out of band with the same value as `CRON_SECRET` (see `supabase/migrations/20260622134716_weekend_code_reminders.sql`).

---

### POST /api/cron/overdue-reminders

**File**: `src/app/api/cron/overdue-reminders/route.ts`
**Roles**: SYSTEM (pg_cron; no user session)

Not user-facing. Called by the `overdue-key-check` pg_cron job hourly, right after `mark_key_overdue()` in the same job (see `supabase/migrations/20260812110000_requester_notifications.sql`) — reuses the `weekend_cron_secret` Vault bearer secret. Finds `KEY_ISSUED` requests (registered and guest) whose `return_deadline` has passed with `overdue_reminder_sent_at IS NULL`, and for each registered requester checks `notification_preferences.overdue_email` (default true if no row) before emailing; guests have no preference and always receive it. Stamps `overdue_reminder_sent_at` for every processed row — including ones suppressed by preference, so they aren't re-queried every hour.

No request body.

**Response `data`**: `{ "sent": 1, "suppressed": 1, "failed": 0 }`

**Errors**: `401` missing/incorrect bearer secret · `500` `CRON_SECRET` not configured or query failure

---

### POST /api/cron/daily-digest

**File**: `src/app/api/cron/daily-digest/route.ts`
**Roles**: SYSTEM (pg_cron; no user session)

Not user-facing. Called by the `daily-digest` pg_cron job at 07:00 UTC daily — same `CRON_SECRET` bearer-auth pattern as the other two cron routes. Finds every `ACTIVE` `DEAN`/`CSO` profile with `notification_preferences.digest_email = true` (absence of a row means **not** opted in — the opposite default from every other preference column) and, for each, calls the `get_digest_stats` RPC (building-wide once, cached, for every CSO; per-unit for each Dean) covering the last 24 hours. Skips sending entirely for a recipient whose window has nothing to report in any relevant field — an always-firing digest with all zeros trains people to ignore it.

No request body.

**Response `data`**: `{ "sent": 1, "skipped": 1, "failed": 0 }`

**Errors**: `401` missing/incorrect bearer secret · `500` `CRON_SECRET` not configured or query failure

---

### POST /api/cron/shift-report

**File**: `src/app/api/cron/shift-report/route.ts`
**Roles**: SYSTEM (pg_cron; no user session)

Not user-facing. Called by the `daily-shift-summary` pg_cron job at 18:00 UTC daily, right after `schedule_pending_shift_report()` in the same job (see `supabase/migrations/20260904103000_shift_report_cron_generation.sql`) — reuses the `weekend_cron_secret` Vault bearer secret, same pattern as the other cron routes. Generating a report means calling Gemini, which plpgsql cannot do, so the SQL function schedules the placeholder and this route fills it in.

Selects the oldest `shift_reports` rows still at `markdown = 'PENDING_GENERATION'` (capped at 5 per invocation — one Gemini call each, inside pg_cron's 25s HTTP timeout) and generates each through the shared `fillShiftReport` helper in `src/lib/ai/reports/generate.ts`, the same code path `POST /api/reports/generate` uses. Because it drains by row rather than by "today's shift", placeholders stranded before this route existed are picked up too. One row failing is logged and skipped, not fatal to the rest.

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

- `alerts` — weekend requests currently held on `PENDING_HOD` with an unresolved `SIGNATURE_MISMATCH` audit entry (written by `POST /api/requests/hod-decision` when a Dean's submitted signature and/or stamp fails verification). A request drops off this list once the CSO resolves it via `cso_override` on `POST /api/requests/hod-decision`.
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
**Roles**: SYSTEM — not session-authenticated at all. Gated by a header check (`x-internal-secret === SUPABASE_SERVICE_ROLE_KEY`), never reachable from a browser. Despite the name, `POST /api/requests/hod-decision` does **not** call this route — it imports and runs `verifySignature()` from `src/lib/ai/signature/verifier.ts` directly in-process (see `docs/AI.md` §3). This route is a standalone diagnostic/calibration endpoint for exercising the same pipeline over HTTP, e.g. from Postman.

| Field                     | Type            | Required |
| ------------------------- | --------------- | -------- |
| `hod_id`                  | `string` (uuid) | yes      |
| `submitted_signature_url` | `string`        | yes      |

Retrieves the Dean's reference signature from Supabase Storage, runs Sharp preprocessing on both, and runs Pixelmatch. Returns the raw mismatch ratio and whether it passes `SIGNATURE_DIFF_THRESHOLD` (default 0.55, scored over the ink region — see `docs/AI.md` §3).

**Response `data`**: `{ "mismatch_ratio": 0.04, "passed": true }`

## **Errors**: `403` missing/incorrect `x-internal-secret` · `422` request body fails validation, or the Dean has no `signature_ref_url` on file · `500` image fetch or verification failure

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

Bytes are streamed behind the session cookie rather than handed out as signed URLs: these images render in dashboards that stay open for a whole shift, so a signed URL would expire mid-shift and leave broken images, and would remain a bearer token for its whole lifetime. A proxied request is re-authorised every time and stops working the moment the session does. Responses carry `Cache-Control: private, max-age=300, must-revalidate` and `X-Content-Type-Options: nosniff`.

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
| `issue_key`                           | POST /api/requests/collect                           | yes                     |
| `generate_weekend_code`               | POST /api/requests/weekend-code                      | yes                     |
| `expire_request`                      | POST /api/requests/expire                            | yes                     |
| `dismiss_expired_request`             | POST /api/requests/dismiss                           | yes                     |
| `request_return`                      | POST /api/requests/request-return                    | yes                     |
| `request_return_guest`                | POST /api/public/weekend-request/[token]/return-code | yes                     |
| `return_key`                          | POST /api/keys/return                                | yes                     |
| `approve_weekend`                     | POST /api/requests/hod-decision                      | yes                     |
| `approve_guest_weekend`               | POST /api/requests/hod-decision                      | yes                     |
| `decline_weekend`                     | POST /api/requests/hod-decision                      | yes                     |
| `nominate_collector`                  | POST /api/admin/authorisations                       | yes                     |
| `remove_collector`                    | DELETE /api/admin/authorisations/[k]/[r]             | yes                     |
| `create_guest_weekend_request`        | POST /api/public/weekend-request                     | yes                     |
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
| 500  | RPC or internal failure — `error` field contains a correlation reference  |
| 503  | External dependency unavailable (Gemini quota exhausted with no fallback) |
