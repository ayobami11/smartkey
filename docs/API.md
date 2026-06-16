# SmartKey — API Route Catalogue

This file is the single reference for every server-side route in SmartKey. It mirrors what `design-system/screens.md` does for UI screens: a spec-level view of what exists, who can call it, what it expects, and what it returns — distinct from the implementation in `src/app/api/`.

**Keep this file up to date on every route addition or change.**

---

## How to read this file

Each route entry shows:

- **Method + path** — the HTTP verb and URL.
- **File** — the `route.ts` that implements it under `src/app/api/`.
- **Roles** — which roles are permitted (`CSO` | `HOD` | `VERIFIER` | `REQUESTER` | `ALL` | `SYSTEM`).
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

**Errors**: `401` invalid credentials · `422` schema validation

---

### POST /api/auth/verify-otp

**File**: `src/app/api/auth/verify-otp/route.ts`
**Roles**: HOD, VERIFIER, REQUESTER (new device)

| Field | Type                | Required |
| ----- | ------------------- | -------- |
| `otp` | `string` (6 digits) | yes      |

**Response `data`**: `{ "session": "<jwt>" }` — full session after MFA.

**Errors**: `401` invalid or expired OTP · `422` schema validation

---

### POST /api/auth/register

**File**: `src/app/api/auth/register/route.ts`
**Roles**: REQUESTER (invite link only)

Completes requester registration. Token from the invite link is validated before any write.

| Field            | Type                             | Required |
| ---------------- | -------------------------------- | -------- |
| `token`          | `string`                         | yes      |
| `password`       | `string` (min 12, mixed, symbol) | yes      |
| `passport_photo` | `File` (image)                   | yes      |

**Response `data`**: `{ "profile_id": "<uuid>" }`

**Errors**: `400` expired/invalid token · `422` weak password or missing photo

---

### POST /api/auth/activate-hod

**File**: `src/app/api/auth/activate-hod/route.ts`
**Roles**: HOD (invite link only)

One-time HOD onboarding. Validates token, sets password, stores signature and stamp references, enables MFA.

| Field       | Type           | Required |
| ----------- | -------------- | -------- |
| `token`     | `string`       | yes      |
| `password`  | `string`       | yes      |
| `signature` | `File` (image) | yes      |
| `stamp`     | `File` (image) | yes      |

**Response `data`**: `{ "profile_id": "<uuid>", "redirect": "/hod" }`

**Errors**: `400` invalid token · `422` validation · `413` image too large

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

The RPC runs the risk engine, generates the code, and writes the audit entry atomically.

**Response `data`**:

```json
{
  "request_id": "<uuid>",
  "code": "123456",
  "code_expires_at": "<iso>",
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
**Roles**: HOD

Returns requests for the HOD's department with `status = 'PENDING_HOD'`, including external (guest) requests for the department (joined `guest` details, `letter_url`, `requested_department_id`) so the HOD can review and assign a key before approving.

**Response `data`**: `{ "requests": [...] }`

---

### POST /api/requests/hod-decision

**File**: `src/app/api/requests/hod-decision/route.ts`
**Roles**: HOD
**RPC**: `approve_weekend(request_id, hod_id, note?)`, `approve_guest_weekend(request_id, hod_id, key_id, note?)`, or `decline_weekend(request_id, hod_id, note?)`

| Field        | Type                       | Required             |
| ------------ | -------------------------- | -------------------- |
| `request_id` | `string` (uuid)            | yes                  |
| `decision`   | `'APPROVED' \| 'DECLINED'` | yes                  |
| `key_id`     | `string` (uuid)            | guest approvals only |
| `note`       | `string`                   | no                   |

For approvals, the RPC runs signature verification. If the mismatch exceeds the threshold, the request is held and a CSO alert is raised — this is not a route-level error.

For an external (guest) request (`guest_id` set), the route requires a `key_id` in the body and calls `approve_guest_weekend` instead — the HOD assigns the key at approval, and signature verification is skipped (guests have no HOD reference signature; the HOD reviews the uploaded letter manually). The decline path reuses `decline_weekend` unchanged.

**Response `data`**: `{ "request_id": "<uuid>", "status": "CODE_ISSUED" }`

**Errors**: `403` request not in HOD's department · `409` already decided · `422` validation

---

### GET /api/requests/cso-queue

**File**: `src/app/api/requests/cso-queue/route.ts`
**Roles**: CSO

Returns escalated requests (risk HIGH or restricted-zone) with `status = 'PENDING_CSO'`.

**Response `data`**: `{ "requests": [...] }`

---

### POST /api/requests/cso-decision

**File**: `src/app/api/requests/cso-decision/route.ts`
**Roles**: CSO

| Field        | Type                       | Required |
| ------------ | -------------------------- | -------- |
| `request_id` | `string` (uuid)            | yes      |
| `decision`   | `'APPROVED' \| 'DECLINED'` | yes      |
| `note`       | `string`                   | no       |

**Response `data`**: `{ "request_id": "<uuid>", "status": "CODE_ISSUED" }`

**Errors**: `409` already decided · `422` validation

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

| Field         | Type                | Required |
| ------------- | ------------------- | -------- |
| `code`        | `string` (6 digits) | yes      |
| `verifier_id` | `string` (uuid)     | yes      |

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

Only cancellable when `status = 'CODE_ISSUED'` (before key collection). Writes audit entry.

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

Multipart form. Uploads the HOD authorisation letter to the `weekend-letters` bucket, creates the guest + request (`PENDING_HOD`, no code), and emails the status link to the guest (via the shared email sender in `src/lib/email/`). Email failure is logged but does not fail the request. Returns `201`.

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

`code` / `code_expires_at` are non-null only while `status = 'CODE_ISSUED'`; `key` is null until the HOD assigns one on approval.

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
**Roles**: HOD

Returns a short-lived (5-minute) signed URL for a guest request's HOD authorisation letter so the HOD can preview it before approving. The letter lives in the private `weekend-letters` bucket; signing happens server-side with the admin client. Access is gated to the HOD whose department owns the request (RLS plus a department check).

**Response `data`**: `{ "url": "<signed-url>" }`

**Errors**: `403` not an HOD / not the request's department · `404` request has no letter · `500` signing failure

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
**Roles**: CSO, HOD

**Query params**: `key_id` · `requester_id` · `from` (ISO date) · `to` (ISO date) · `limit` · `cursor`

HOD sees only their department's keys (RLS enforced). CSO sees all.

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
**RPC**: `provision_user(name, email, role, department_id?)`

| Field                 | Type                                 | Required          |
| --------------------- | ------------------------------------ | ----------------- |
| `full_name`           | `string`                             | yes               |
| `institutional_email` | `string` (email)                     | yes               |
| `role`                | `'HOD' \| 'VERIFIER' \| 'REQUESTER'` | yes               |
| `department_id`       | `string` (uuid)                      | HOD and REQUESTER |

Creates the profile, generates a 24-hour activation token, queues the invite email via Resend, and writes the audit entry — all inside the RPC.

**Response `data`**: `{ "profile_id": "<uuid>", "status": "PENDING_ACTIVATION" }`

**Errors**: `409` email already registered · `422` validation

---

### GET /api/admin/users

**File**: `src/app/api/admin/users/route.ts`
**Roles**: CSO

**Query params**: `role` · `department_id` · `status` (`PENDING_ACTIVATION | ACTIVE | DEACTIVATED`) · `limit` · `cursor`

**Response `data`**: `{ "users": [...], "next_cursor": "<opaque>" }`

---

### PATCH /api/admin/users/[id]/revoke

**File**: `src/app/api/admin/users/[id]/revoke/route.ts`
**Roles**: CSO

No request body. Sets `profiles.status = 'DEACTIVATED'`. Supabase Auth session is invalidated immediately. Writes audit entry.

**Response `data`**: `{ "profile_id": "<uuid>", "status": "DEACTIVATED" }`

**Errors**: `404` user not found · `409` already deactivated

---

### POST /api/admin/authorisations

**File**: `src/app/api/admin/authorisations/route.ts`
**Roles**: HOD

Submits a collector nomination. Enforces the max-3-per-key constraint at the DB level (`UNIQUE(key_id, slot_number)`).

| Field          | Type            | Required |
| -------------- | --------------- | -------- |
| `key_id`       | `string` (uuid) | yes      |
| `requester_id` | `string` (uuid) | yes      |

**Response `data`**: `{ "authorisation_id": "<composite>", "slot_number": 2 }`

**Errors**: `403` key not in HOD's department · `409` three slots already filled · `409` requester already authorised for this key

---

### DELETE /api/admin/authorisations/[key_id]/[requester_id]

**File**: `src/app/api/admin/authorisations/[key_id]/[requester_id]/route.ts`
**Roles**: HOD

Removes a collector from a slot. Writes audit entry.

**Response `data`**: `null` (204)

**Errors**: `403` key not in HOD's department · `404` authorisation not found

---

## 5. Shifts and Handover

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

The RPC collects audit events for the shift, calls the Gemini API with the structured prompt, stores the result as an immutable `shift_reports` row, and writes an audit entry. Falls back to a template if Gemini is unavailable.

**Response `data`**: `{ "report_id": "<uuid>", "generated_at": "<iso>" }`

**Errors**: `409` report already generated for this shift · `503` Gemini and fallback both failed (rare)

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

## 7. AI

### GET /api/ai/risk-alerts

**File**: `src/app/api/ai/risk-alerts/route.ts`
**Roles**: CSO

Returns active high-risk access patterns: requests with `risk_tier = 'HIGH'` in the last 24 hours that have not been resolved. Read-only; the risk engine runs at request-submit time, not on this endpoint.

**Response `data`**: `{ "alerts": [...] }`

---

### POST /api/ai/verify-signature

**File**: `src/app/api/ai/verify-signature/route.ts`
**Roles**: SYSTEM (called internally from `approve_weekend` RPC callback, not directly by clients)

| Field                     | Type            | Required |
| ------------------------- | --------------- | -------- |
| `hod_id`                  | `string` (uuid) | yes      |
| `submitted_signature_url` | `string`        | yes      |

Retrieves the HOD's reference signature from Supabase Storage, runs Sharp preprocessing on both, and runs Pixelmatch. Returns the mismatch ratio.

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
| `return_key`                   | POST /api/keys/return                           | yes                     |
| `approve_weekend`              | POST /api/requests/hod-decision                 | yes                     |
| `approve_guest_weekend`        | POST /api/requests/hod-decision                 | yes                     |
| `decline_weekend`              | POST /api/requests/hod-decision                 | yes                     |
| `create_guest_weekend_request` | POST /api/public/weekend-request                | yes                     |
| `generate_guest_weekend_code`  | POST /api/public/weekend-request/[token]/code   | yes                     |
| `expire_guest_request`         | POST /api/public/weekend-request/[token]/expire | yes                     |
| `acknowledge_shift_handover`   | POST /api/shifts/handover                       | yes — per key           |
| `generate_shift_report`        | POST /api/reports/generate                      | yes                     |
| `add_report_comment`           | POST /api/reports/[id]/comments                 | yes                     |
| `provision_user`               | POST /api/admin/users                           | yes                     |

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
