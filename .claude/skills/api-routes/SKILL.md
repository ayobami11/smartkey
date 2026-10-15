---
name: api-routes
description: Use this skill when writing or reviewing any Next.js API route in SmartKey. Covers the route() wrapper, the response envelope, Supabase session and role gating, Zod validation, RPC-first mutations via callRpc, RPC error mapping, and what must never happen in a route handler.
---

# API route discipline

Every SmartKey API route is a serverless function in `src/app/api/`. Routes are the boundary between the browser and Supabase. They validate identity, enforce business rules, call RPCs, and return one consistent shape. Inconsistency here is how bugs and security holes appear, so the repeated parts live in one module, `src/lib/http/`, and routes use it instead of hand-rolling them.

## When to apply

- Writing a new `route.ts` under `src/app/api/`
- Reviewing or modifying an existing route handler
- Any code that reads from or writes to Supabase on the server

## The three pieces

| File                         | What it gives you                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| `src/lib/http/route.ts`      | `route({...})`: auth, role, params, body and the catch-all 500, in a fixed order          |
| `src/lib/http/respond.ts`    | `respond.ok / fail / error / internal / noContent`, the only envelope builder             |
| `src/lib/http/rpc-errors.ts` | `rpcFail(error, overrides?)`, `byDetail(...)`, and the default `RPC_ERROR_HTTP` catalogue |

Plus `callRpc` / `callRpcVoid` from `src/lib/rpc/call-rpc.ts` for every RPC call.

## A typical mutation route

```typescript
import * as z from 'zod';

import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { rpcFail } from '@/lib/http/rpc-errors';
import { callRpc } from '@/lib/rpc/call-rpc';

const bodySchema = z.object({ request_id: z.uuid() });

export const POST = route({
  name: 'requests/request-return',
  auth: 'user',
  roles: ['REQUESTER'],
  body: bodySchema,
  handler: async ({ supabase, user, body }) => {
    const result = await callRpc(supabase, 'request_return', {
      p_request_id: body.request_id,
      p_requester_id: user.id, // from the session, never from the body
    });
    if (!result.ok) {
      return rpcFail(result.error, { NOT_FOUND: 'Request not found' });
    }
    return respond.ok(result.data);
  },
});
```

The handler only ever sees a validated `body`, an authenticated `user`, and (because `roles` is set) the caller's `profile` (`role`, `unit_id`, `full_name`).

## What `route()` does, in order

1. **Auth**:
   - `auth: 'user'`: `supabase.auth.getUser()`, never `getSession()`. No user → `401 Unauthorized`.
   - `auth: 'cron'`: `Authorization: Bearer ${CRON_SECRET}`, compared in constant time. An unset secret → ref'd `500`; a mismatch → `401`.
   - `auth: 'public'`: nothing. Use it only for token-authorised routes such as `/api/public/*`.
2. **Role**, if `roles` is given. Reads `profiles.role`, never the JWT claim. No profile, or a `DEACTIVATED` one → `401`; wrong role → `403 Forbidden`. Omitting `roles` skips the profile query (and the status check) entirely.
3. **Params**, if a `params` schema is given (dynamic segments). Failure → `paramsError`, default `404 Not found`.
4. **Body**, if a `body` schema is given. Bad JSON or schema failure → `422 Invalid request body`. Multipart routes omit `body` and read `ctx.request.formData()` themselves; a file is stored under the type `checkUpload` (`src/lib/storage/upload-type.ts`) detects from its bytes, never `File.type` or the filename.
5. **Handler.** Anything thrown anywhere becomes `500 "Internal error. Ref: <ref>"`, logged as `<name>: unhandled error`.

A dynamic route:

```typescript
export const POST = route({
  name: 'reports/comments',
  auth: 'user',
  roles: ['CSO'],
  params: z.object({ id: z.uuid() }),
  body: z.object({ text: z.string().min(1) }),
  handler: async ({ supabase, params, body }) => {
    const result = await callRpc(supabase, 'add_report_comment', {
      p_report_id: params.id,
      p_text: body.text,
    });
    if (!result.ok) {
      return rpcFail(result.error, { NOT_FOUND: 'Report not found' });
    }
    return respond.ok(result.data, 201);
  },
});
```

`public` and `cron` handlers get no Supabase client. If one needs the service role, it calls `createAdminClient()` itself, so every use of the service role is visible in the handler.

## Response envelope

```typescript
type ApiResponse<T> =
  | { data: T; error: null; status: number }
  | { data: null; error: string; status: number };
```

Build it only with `respond.*`. Never call `NextResponse.json(...)` with a hand-built envelope: that is how the envelope status and the HTTP status drifted apart in 11 routes.

```typescript
respond.ok(data); // 200
respond.ok(data, 201); // created
respond.fail(409, 'Handover already completed for this shift');
respond.error({ status: 403, message: 'Forbidden' });
respond.internal('keys/out: query failed', { err: error.message }); // ref'd 500
respond.noContent(); // 204
```

## RPC-first mutations

Any operation that changes more than one row, including every operation that writes an audit entry, goes through a Postgres RPC so the state change and its audit entry are atomic. Call it with `callRpc` (or `callRpcVoid` for `returns void` RPCs such as `remove_collector`, `update_risk_config` and `update_operational_config`). Never use a bare `supabase.rpc(...)` and string-match its error message.

```typescript
// WRONG: two separate writes, so the audit entry may be missing if the second fails
await supabase.from('requests').update({ status: 'KEY_ISSUED' }).eq('id', id);
await supabase.from('audit_log').insert({ event: 'KEY_ISSUED' /* … */ });
```

## Mapping RPC errors

`callRpc` returns `{ ok: false, error: { kind, detail, ref? } }`. Return `rpcFail(result.error, overrides?)`. The default copy per kind lives in `RPC_ERROR_HTTP` (see `docs/API.md` → "RPC error mapping"). Override only what this route needs to say differently:

```typescript
return rpcFail(result.error, {
  NOT_FOUND: 'Request not found', // string: new message, default status
  CONFLICT: {
    status: 409,
    message: 'This request is not awaiting collection.',
  },
  FORBIDDEN: (detail) =>
    detail.startsWith('not your') ? 'This is not your request' : undefined,
});
```

When one kind covers several situations, branch on the detail with `byDetail`, and map each match to fixed copy:

```typescript
import { byDetail, rpcFail } from '@/lib/http/rpc-errors';

return rpcFail(result.error, {
  CONFLICT: byDetail([
    [/^three/, 'Three authorisation slots are already filled'],
    [/^requester/, 'Requester is already authorised for this key'],
  ]),
});
```

Rules:

- **Never write a private `mapRpcError`.** Never use `msg.includes('KIND')`: a substring match misclassifies any detail that mentions another kind.
- **Never send `detail` to the client.** It can name internal states (`current: PENDING_HOD`). An override returns fixed copy and never the detail it was given.
- **`INTERNAL` is not overridable.** It is always `500 "Internal error. Ref: <ref>"`, where the ref is the one `callRpc` already logged.

## Status codes

| Situation                            | Code |
| ------------------------------------ | ---- |
| Success with body                    | 200  |
| Created (POST that inserts)          | 201  |
| Success, no body                     | 204  |
| Unauthenticated, or no profile       | 401  |
| Authenticated but wrong role         | 403  |
| Resource not found / bad path params | 404  |
| State conflict                       | 409  |
| Zod validation failure               | 422  |
| RPC or internal failure (with ref)   | 500  |

## What must never appear in a route

| Forbidden                                        | Reason                                                     |
| ------------------------------------------------ | ---------------------------------------------------------- |
| `supabase.auth.getSession()` for auth decisions  | Client-controllable; `route()` uses `getUser()`            |
| A hand-built `{ data, error, status }`           | Use `respond.*`; the statuses drift otherwise              |
| A private `mapRpcError` / `msg.includes('KIND')` | Use `rpcFail` with overrides                               |
| RPC `detail`, Supabase error text or a stack     | Log it; the client gets copy or a ref                      |
| `createAdminClient()` in browser-reachable code  | Service role bypasses RLS; server-only, explicit per route |
| An actor id taken from the request body          | Use `user.id` from the session                             |
| Raw `fetch` to Supabase REST                     | Use the typed client from `src/lib/supabase/`              |
| `console.log`                                    | Use `src/lib/logger.ts`                                    |
| Direct `INSERT` into `audit_log`                 | Go through an RPC or `src/lib/audit/`                      |
| Two separate writes where an RPC exists          | Non-atomic; audit integrity at risk                        |

## Not wrapped by `route()`

Every other route under `src/app/api/` is on `route()`; the migration finished on 2026-10-14. These routes keep their own flow but still build responses with `respond.*`: the `auth/*` routes (they establish sessions, set cookies and redirect), `health`, `storage/object` (it returns bytes), and `ai/verify-signature` (its shared-secret gate runs before `route()`; use `secretMatches` for any shared-secret check, never `===`).

## Route checklist

- [ ] Exported through `route({ name, auth, roles?, params?, body?, handler })`, unless it is in the list above
- [ ] `roles` set if the route is role-specific
- [ ] Every input parsed by a `body` / `params` Zod schema
- [ ] Mutations go through `callRpc` / `callRpcVoid`, not raw `.from().update()`
- [ ] RPC failures returned via `rpcFail`, overriding only the kinds whose copy differs
- [ ] Responses built with `respond.*` only
- [ ] `bun run typecheck && bun run lint` pass
