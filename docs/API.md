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

| Field | Type                | Required |
| ----- | ------------------- | -------- |
| `email` | `string` (email)  | yes      |
| `otp` | `string` (6 digits) | yes      |

**Response `data`**: `{ "session": "<jwt>" }` — full session after MFA.

**Errors**: `401` invalid or expired OTP · `422` schema validation

---

### POST /api/auth/register

**File**: `src/app/api/auth/register/route.ts`
**Roles**: REQUESTER (invite link only)

Completes requester registration. There is no `token` field — the invite link is a Supabase magic link that resolves through `GET /api/auth/callback` (below) into a short-lived session in the transient `activate` cookie namespace **before** the browser ever reaches this route; this route just reads that session.

| Field            | Type                    | Required |
| ---------------- | ----------------------- | -------- |
| `password`       | `string` (min 8)        | yes      |
| `passport_photo` | `File` (image, max 5MB) | yes      |

**Response `data`**: `{ "profile_id": "<uuid>" }`

**Errors**: `401` no valid activation session · `422` password under 8 chars or missing photo · `413` photo over 5MB

**Note**: the password rule here (min 8, no composition requirement) is weaker than the "min 12, mixed case, number, symbol" rule stated in `design-system/screens.md` §5.1 and `docs/PRODUCT.md` — the code has not caught up to the product spec. Worth a follow-up ticket rather than a doc fix, since relaxing the spec further would be the wrong direction.

---

### POST /api/auth/activate-hod

**File**: `src/app/api/auth/activate-hod/route.ts`
**Roles**: DEAN (invite link only)

One-time Dean onboarding. There is no `token` field — as with `/api/auth/register`, the invite link resolves through `GET /api/auth/callback` into a session in the `activate` namespace before this route runs. Sets password, stores signature and stamp references, enables MFA.

| Field       | Type           | Required |
| ----------- | -------------- | -------- |
| `password`  | `string` (min 8) | yes    |
| `signature` | `File` (image) | yes      |
| `stamp`     | `File` (image) | yes      |

**Response `data`**: `{ "profile_id": "<uuid>", "redirect": "/hod" }`

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

Triggers a Supabase Auth password-reset email. Always returns 200 (no email enumeration).

**Response `data`**: `null`

---

### GET /api/auth/callback

**File**: `src/app/api/auth/callback/route.ts`
**Roles**: ALL (unauthenticated)

Not a JSON API route — a redirect handler. Supabase invite/reset/magic-link emails point here with `?code=...&next=...`. Exchanges the one-time PKCE `code` for a session in the transient `activate` cookie namespace via `exchangeCodeForSession`, then redirects to `next` (defaults to `/`). This is the route that makes the session `/api/auth/register` and `/api/auth/activate-hod` read — those two never see a `token` field. On failure, redirects to `/forgot-password?error=expired`.

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

| Field             | Type                       | Required     |
| ----------------- | -------------------------- | ------------ |
| `key_id`          | `string` (uuid)            | yes          |
| `type`            | `'WEEKDAY' \| 'WEEKEND'`   | yes          |
| `return_deadline` | `string` (ISO timestamptz) | yes          |
| `weekend_date`    | `string` (ISO date)        | WEEKEND only |
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

| Field          | Type                       | Required                           |
| -------------- | -------------------------- | ---------------------------------- |
| `request_id`   | `string` (uuid)            | yes                                |
| `decision`     | `'APPROVED' \| 'DECLINED'` | yes                                |
| `key_id`       | `string` (uuid)            | guest approvals only               |
| `note`         | `string`                   | no                                 |
| `cso_override` | `boolean`                  | CSO resolving a held mismatch only |

For approvals, the route runs signature verification before calling the RPC. If the mismatch exceeds the threshold, the approval is **held** — the RPC is never called — and a `SIGNATURE_MISMATCH` audit entry is written instead. The response in this case is `{ "request_id": "<uuid>", "status": "HELD_SIGNATURE_MISMATCH", "mismatch_pct": <number> }` (still HTTP 200 — this is not a route-level error).

For an external (guest) request (`guest_id` set), the route requires a `key_id` in the body and calls `approve_guest_weekend` instead — the Dean assigns the key at approval, and signature verification is skipped (guests have no Dean reference signature; the Dean reviews the uploaded letter manually). The decline path reuses `decline_weekend` unchanged.

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

| Field        | Type                       | Required |
| ------------ | -------------------------- | -------- |
| `request_id` | `string` (uuid)            | yes      |
| `decision`   | `'APPROVED' \| 'DECLINED'` | yes      |
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

Requester-initiated and fired automatically by the UI when a collection code's countdown reaches 0. Flips a genuinely-expired `CODE_ISSUED` request to `EXPIRED`, clears the code, and writes a `REQUEST_EXPIRED` audit entry. Idempotent — returns the current status with no error if the request already moved on.

| Field        | Type            | Required |
| ------------ | --------------- | -------- |
| `request_id` | `string` (uuid) | yes      |

**Response `data`**: `{ "request_id": "<uuid>", "status": "EXPIRED" }`

**Errors**: `403` not the requester's own request · `409` code has not expired yet · `404` request not found

---

### Public (external/guest) weekend requests

These routes let an external person with no SmartKey account submit a weekend key request and reach their session-less status/code page. They require **no authentication** and run server-side via the service-role admin client (`createAdminClient`); the guest RPCs are revoked from `anon`/`public`, so nothing new is exposed to the browser. The guest is identified throughout by the unguessable `access_token` returned at submit.

#### POST /api/public/weekend-request

**File**: `src/app/api/public/weekend-request/route.ts`
**Roles**: ALL (unauthenticated)
**RPC**: `create_guest_weekend_request(full_name, email, phone, id_type, id_number, department_id, weekend_date, return_deadline, letter_url, requested_room)`

Multipart form. Uploads the Dean authorisation letter to the `weekend-letters` bucket, creates the guest + request (`PENDING_HOD`, no code), and emails the status link to the guest (via the shared email sender in `src/lib/email/`). Email failure is logged but does not fail the request. Returns `201`.

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

Fired automatically by the status page when the collection code's countdown reaches 0. Flips a genuinely-expired `CODE_ISSUED` request to `EXPIRED`, clears the code, and writes a `REQUEST_EXPIRED` audit entry. Idempotent — returns the current status with no error if the request already moved on.

**Response `data`**: `{ "request_id": "<uuid>", "status": "EXPIRED" }`

**Errors**: `409` code has not expired yet · `404` token not found

---

### GET /api/requests/[id]/letter

**File**: `src/app/api/requests/[id]/letter/route.ts`
**Roles**: DEAN

Returns a short-lived (5-minute) signed URL for a guest request's Dean authorisation letter so the Dean can preview it before approving. The letter lives in the private `weekend-letters` bucket; signing happens server-side with the admin client. Access is gated to the Dean whose faculty owns the request (RLS plus a faculty check).

**Response `data`**: `{ "url": "<signed-url>" }`

**Errors**: `403` not a Dean / not the request's faculty · `404` request has no letter · `500` signing failure

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
| --------------------- | -------------------------------------- | ------------------ |
| `full_name`           | `string`                              | yes                 |
| `institutional_email` | `string` (email)                      | yes                 |
| `role`                | `'DEAN' \| 'VERIFIER' \| 'REQUESTER'` | yes                 |
| `unit_id`             | `string` (uuid)                       | DEAN and REQUESTER  |

Creates the profile, generates a 24-hour activation token, queues the invite email via Nodemailer (Gmail SMTP), and writes the audit entry — all inside the RPC.

**Response `data`**: `{ "profile_id": "<uuid>", "status": "PENDING_ACTIVATION" }`

**Errors**: `409` email already registered · `422` validation

---

### GET /api/admin/users

**File**: `src/app/api/admin/users/route.ts`
**Roles**: CSO

No query params — the route returns every non-deactivated profile unconditionally (joined with `unit:units!unit_id(name)`) and defers role/unit/status filtering and pagination to the client. There is no cursor-based pagination.

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

| Field     | Type            | Required                       |
| --------- | --------------- | ------------------------------- |
| `full_name` | `string`      | yes                              |
| `unit_id`   | `string` (uuid) | Dean and REQUESTER targets     |

**Response `data`**: `{ "profile_id": "<uuid>", "full_name": "<name>", "unit_id": "<uuid|null>" }`

**Errors**: `404` user not found · `409` destination faculty already has a Dean · `422` validation / unit required / unit not found

---

### GET /api/admin/units

**File**: `src/app/api/admin/units/route.ts`
**Roles**: CSO

No query params. Returns every unit (faculty or Administration) with its Dean, an `hasActiveHod` flag (an `ACTIVE` Dean is already assigned — used to grey out that unit in the Dean-role picker on `POST /api/admin/users`), and a `hasAvailableKey` flag.

**Response `data`**: `{ "units": [...] }`

**Note**: `GET /api/admin/departments` (`src/app/api/admin/departments/route.ts`) is an undocumented near-duplicate of this route, differing only in returning `{ "departments": [...] }` instead of `{ "units": [...] }` — appears to be a pre-rename leftover kept for some caller that hasn't migrated. Worth confirming whether anything still calls it and retiring it if not.

---

### POST /api/admin/keys

**File**: `src/app/api/admin/keys/route.ts`
**Roles**: CSO

| Field       | Type                            | Required |
| ----------- | -------------------------------- | -------- |
| `code`      | `string` (matches `^[A-Z0-9]+-\d+$`) | yes  |
| `zone`      | `'NEW_SENATE' \| 'OLD_SENATE'`  | yes      |
| `room_name` | `string`                         | yes      |
| `unit_id`   | `string` (uuid)                  | yes      |
| `key_count` | `integer` (1–20, default 1)      | no       |

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

| Field       | Type   | Required |
| ----------- | ------ | -------- |
| `full_name` | `string` | yes    |

**Response `data`**: `{ "full_name": "<name>" }`

**Errors**: `401` unauthenticated · `422` missing/blank full_name

---

### POST /api/profile/photo

**File**: `src/app/api/profile/photo/route.ts`
**Roles**: ALL (authenticated)

Multipart form; replaces the caller's own profile photo in the `passport-photos` bucket. One route serves every role's settings screen (the storage folder is keyed by user id, not a role namespace).

| Field   | Type                    | Required |
| ------- | ------------------------ | -------- |
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

| Field   | Type                    | Required                        |
| ------- | ------------------------ | -------------------------------- |
| `type`  | `'signature' \| 'stamp'` | yes                              |
| `image` | `File` (image, max 5MB) | yes                               |

If the mismatch exceeds `SIGNATURE_DIFF_THRESHOLD` (default 15%), the reference is **not** replaced — a `SIGNATURE_MISMATCH` audit entry is written (`context: 'reference_replacement'`) and the response reports the held state (still HTTP 200). Otherwise the reference is replaced and a `SIGNATURE_REFERENCE_UPDATED` entry is written.

**Response `data`** (held): `{ "status": "HELD_SIGNATURE_MISMATCH", "mismatch_pct": <number>, "message": "..." }`
**Response `data`** (updated): `{ "status": "updated", "new_url": "<url>" }`

**Errors**: `401` unauthenticated · `403` not DEAN · `422` missing/invalid type or image · `413` over 5MB

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

**Response `data`**: `{ "report_id": "<uuid>", "generated_at": "<iso>" }`

**Errors**: `409` report already generated for this shift

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

If `severity = 'HIGH'`, the AI shift-report generation is triggered immediately and a CSO dashboard alert is raised via Realtime.

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

Returns weekend requests currently held on `PENDING_HOD` with an unresolved `SIGNATURE_MISMATCH` audit entry (written by `POST /api/requests/hod-decision` when a Dean's submitted signature fails verification). Read-only. A request drops off this list once the CSO resolves it via `cso_override` on `POST /api/requests/hod-decision`.

**Response `data`**:

```json
{
  "alerts": [
    {
      "id": "<uuid>",
      "requested_for": "2026-07-04",
      "occurred_at": "<iso>",
      "ref_url": "<url>",
      "submitted_url": "<url>",
      "mismatch_pct": 22.5,
      "threshold_pct": 15,
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
  ]
}
```

---

### POST /api/ai/verify-signature

**File**: `src/app/api/ai/verify-signature/route.ts`
**Roles**: SYSTEM (called internally from `approve_weekend` RPC callback, not directly by clients)

| Field                     | Type            | Required |
| ------------------------- | --------------- | -------- |
| `hod_id`                  | `string` (uuid) | yes      |
| `submitted_signature_url` | `string`        | yes      |

Retrieves the Dean's reference signature from Supabase Storage, runs Sharp preprocessing on both, and runs Pixelmatch. Returns the mismatch ratio.

**Response `data`**: `{ "mismatch_ratio": 0.04, "passed": true }`

If `passed = false`, the caller raises a CSO alert and holds the approval.

---

## RPC cross-reference

| RPC                            | Called by route                                 | Also writes audit entry |
| ------------------------------ | ----------------------------------------------- | ----------------------- |
| `create_request`               | POST /api/requests/submit                       | yes                     |
| `issue_key`                    | POST /api/requests/collect                      | yes                     |
| `generate_weekend_code`        | POST /api/requests/weekend-code                 | yes                     |
| `expire_request`               | POST /api/requests/expire                       | yes                     |
| `request_return`               | POST /api/requests/request-return               | yes                     |
| `request_return_guest`         | POST /api/public/weekend-request/[token]/return-code | yes                |
| `return_key`                   | POST /api/keys/return                           | yes                     |
| `approve_weekend`              | POST /api/requests/hod-decision                 | yes                     |
| `approve_guest_weekend`        | POST /api/requests/hod-decision                 | yes                     |
| `decline_weekend`              | POST /api/requests/hod-decision                 | yes                     |
| `nominate_collector`           | POST /api/admin/authorisations                  | yes                     |
| `remove_collector`             | DELETE /api/admin/authorisations/[k]/[r]        | yes                     |
| `create_guest_weekend_request` | POST /api/public/weekend-request                | yes                     |
| `generate_guest_weekend_code`  | POST /api/public/weekend-request/[token]/code   | yes                     |
| `expire_guest_request`         | POST /api/public/weekend-request/[token]/expire | yes                     |
| `acknowledge_shift_handover`   | POST /api/shifts/handover                       | yes — per key           |
| `generate_shift_report`        | POST /api/reports/generate                      | yes                     |
| `add_report_comment`           | POST /api/reports/[id]/comments                 | yes                     |
| `provision_user`               | POST /api/admin/users                           | yes                     |
| `mark_key_overdue`             | cron only (`pg_cron`, hourly) — no route caller | yes — per key           |
| `schedule_pending_shift_report`| cron only (`pg_cron`, daily 18:00) — no route caller | yes — when a CSO exists |

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
