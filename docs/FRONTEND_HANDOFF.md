# SmartKey — Frontend Engineer Handoff

## What's live on `main` right now

All backend infrastructure is merged and deployed:

- Supabase schema (12 tables), RLS policies, 10 Postgres RPCs
- Next.js middleware with role gating (`/cso/*`, `/hod/*`, `/verifier/*`, `/me/*`)
- Auth routes, request management routes

The full API spec is in `docs/API.md`. Every route has its method, roles, request body, response shape, and error codes. Read that file before touching any route.

---

## Base URL

All routes are under `/api/`. Same origin as the Next.js app — no CORS config needed.

---

## Response envelope

Every route returns this shape:

```ts
type ApiResponse<T> =
  | { data: T; error: null; status: number }
  | { data: null; error: string; status: number }
```

Helper types are in `src/types/api.ts`. DB types (enums, table shapes) are in `src/types/database.ts`.

---

## Auth flow

```
POST /api/auth/login  { email, password }
→ { session, role, mfa_required }

If mfa_required === true:
  POST /api/auth/verify-otp  { email, otp }
  → { session }

On any authenticated route: pass the session token in the Supabase client.
The server validates it via getUser() on every request.
```

**Role values**: `CSO` | `HOD` | `VERIFIER` | `REQUESTER`

Other auth routes:
- `POST /api/auth/logout` — no body, invalidates session
- `POST /api/auth/reset-password` — `{ email }`, always returns 200
- `POST /api/auth/register` — multipart: `token`, `password`, `passport_photo` (REQUESTER activation)
- `POST /api/auth/activate-hod` — multipart: `token`, `password`, `signature`, `stamp` (HOD onboarding)

---

## Routes you can wire now

### HOD

| Method | Route | What it does |
|---|---|---|
| `GET` | `/api/requests/pending` | Weekend requests awaiting HOD decision |
| `POST` | `/api/requests/hod-decision` | `{ request_id, decision: 'APPROVED'\|'DECLINED', note? }` |

### CSO

| Method | Route | What it does |
|---|---|---|
| `GET` | `/api/requests/cso-queue` | HIGH-risk requests needing CSO attention |
| `POST` | `/api/requests/cso-decision` | `{ request_id, decision: 'APPROVED'\|'DECLINED', note? }` |

### Verifier

| Method | Route | What it does |
|---|---|---|
| `GET` | `/api/requests/live-queue` | All CODE_ISSUED requests (initial load; Realtime handles updates) |
| `POST` | `/api/requests/collect` | `{ code, verifier_id }` — issues a key |

### Requester

| Method | Route | What it does |
|---|---|---|
| `GET` | `/api/requests/my` | Own request history (`?status=&limit=&cursor=`) |
| `POST` | `/api/requests/submit` | `{ key_id, type, return_deadline, weekend_date? }` |
| `POST` | `/api/requests/cancel` | `{ request_id }` — cancels a CODE_ISSUED request |

---

## Routes NOT yet built — don't wire these yet

These are coming in the next PR. Block any frontend work that depends on them.

| Route | Needed by |
|---|---|
| `POST /api/keys/return` | Verifier return-key flow |
| `GET /api/keys/out` | Verifier + CSO outstanding keys view |
| `GET /api/keys/history` | CSO + HOD key history pages |
| `POST /api/keys/mark-lost` | CSO mark key as lost |
| `POST /api/admin/users` | CSO provision new user |
| `GET /api/admin/users` | CSO user list |
| `PATCH /api/admin/users/[id]/revoke` | CSO deactivate user |
| `POST /api/admin/authorisations` | HOD nominate collector |
| `DELETE /api/admin/authorisations/[key_id]/[requester_id]` | HOD remove collector |
| `GET /api/shifts/current` | Verifier + CSO shift info |
| `POST /api/shifts/handover` | Verifier shift handover |
| `GET /api/reports` | CSO reports list |
| `POST /api/reports/generate` | CSO generate shift report |
| `POST /api/reports/[id]/comments` | CSO add report comment |
| `GET /api/incidents` | CSO incident log |
| `POST /api/incidents` | CSO + Verifier log incident |
| `GET /api/ai/risk-alerts` | CSO risk alert feed |

---

## Error codes

| Code | Meaning |
|---|---|
| `401` | No valid session — redirect to `/login` |
| `403` | Wrong role |
| `404` | Not found |
| `409` | State conflict (already issued, slots full, etc.) |
| `422` | Validation failure |
| `500` | Internal error — `error` field has a correlation reference |

---

## Supabase client (browser)

Import from `src/lib/supabase/client.ts`:

```ts
import { createBrowserClient } from '@/lib/supabase/client'
```

Use this for Realtime subscriptions and session management in Client Components. Never use the service-role key in the browser.

---

## Key enums (from `src/types/database.ts`)

```ts
type UserRole    = 'CSO' | 'HOD' | 'VERIFIER' | 'REQUESTER'
type RequestStatus = 'PENDING_HOD' | 'CODE_ISSUED' | 'KEY_ISSUED' | 'KEY_RETURNED' | 'EXPIRED' | 'CANCELLED' | 'DECLINED'
type RiskTier    = 'LOW' | 'MEDIUM' | 'HIGH'
type Zone        = 'NEW_SENATE' | 'OLD_SENATE'
type KeyStatus   = 'AVAILABLE' | 'ISSUED' | 'OVERDUE' | 'RETIRED'
```
