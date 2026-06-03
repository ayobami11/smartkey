---
name: api-routes
description: Use this skill when writing or reviewing any Next.js API route in SmartKey. Covers the response envelope shape, Supabase JWT validation, role gating, Zod validation, RPC-first mutations, error responses, and what must never happen in a route handler.
---

# API route discipline

Every SmartKey API route is a serverless function in `src/app/api/`. Routes are the boundary between the browser and Supabase — they validate identity, enforce business rules, call RPCs, and return a consistent shape. Inconsistency here is how bugs and security holes appear.

## When to apply

- Writing a new `route.ts` under `src/app/api/`
- Reviewing or modifying an existing route handler
- Adding a new Server Action in a Server Component
- Any code that reads from or writes to Supabase on the server

## Response envelope

Every route returns the same shape. No exceptions.

```typescript
// src/types/api.ts
type ApiResponse<T> =
  | { data: T; error: null; status: number }
  | { data: null; error: string; status: number };
```

```typescript
// Success
return NextResponse.json(
  { data: result, error: null, status: 200 },
  { status: 200 }
);

// Error
return NextResponse.json(
  { data: null, error: 'Request not found.', status: 404 },
  { status: 404 }
);
```

Never return a bare object, never nest `{ success: true }`, never mix shapes between routes.

## Authentication pattern

Every protected route validates the session via the server Supabase client before any other logic.

```typescript
import { createServerClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { data: null, error: 'Unauthenticated.', status: 401 },
      { status: 401 }
    );
  }

  // Continue with user.id available
}
```

Never use `getSession()` for authorisation — sessions are client-controlled. `getUser()` re-validates the JWT with the Supabase server on every call.

## Role gating

Fetch the role from `profiles` after confirming the user identity. Never trust a role stored in the JWT claim alone for write operations.

```typescript
const { data: profile } = await supabase
  .from('profiles')
  .select('role')
  .eq('id', user.id)
  .single();

if (!profile || profile.role !== 'VERIFIER') {
  return NextResponse.json(
    { data: null, error: 'Forbidden.', status: 403 },
    { status: 403 }
  );
}
```

Route-level role checks are a defence-in-depth layer. RLS is the authoritative enforcement — but do not skip the route check.

## Input validation with Zod

Parse and validate the request body before any database call. Never pass unvalidated input to Supabase.

```typescript
import { z } from 'zod';

const issueKeySchema = z.object({
  requestId: z.uuid(),
  verifierId: z.uuid(),
});

export async function POST(req: NextRequest) {
  // ... auth check above ...

  const body = await req.json();
  const parsed = issueKeySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        data: null,
        error: parsed.error.issues.map((i) => i.message).join('; '),
        status: 422,
      },
      { status: 422 }
    );
  }

  const { requestId, verifierId } = parsed.data;
  // safe to use
}
```

## RPC-first for mutations

Any operation that changes more than one row — including all operations that write an audit log entry — must go through a Postgres RPC, not individual Supabase client calls. This makes state changes and audit entries atomic.

```typescript
// CORRECT: single RPC wraps the state change + audit log write
const { data, error } = await supabase.rpc('issue_key', {
  p_request_id: requestId,
  p_verifier_id: verifierId,
});

if (error) {
  return NextResponse.json(
    { data: null, error: 'Failed to issue key.', status: 500 },
    { status: 500 }
  );
}

return NextResponse.json({ data, error: null, status: 200 }, { status: 200 });
```

```typescript
// WRONG: two separate writes — audit entry may be missing if the second call fails
await supabase.from('requests').update({ status: 'KEY_ISSUED' }).eq('id', requestId)
await supabase.from('audit_log').insert({ event: 'key_issued', ... })
```

See `src/lib/audit/` for the audit writer and `docs/DATABASE.md` for all available RPCs.

## Status codes

| Situation                    | Code |
| ---------------------------- | ---- |
| Success with body            | 200  |
| Created (POST that inserts)  | 201  |
| Unauthenticated              | 401  |
| Authenticated but wrong role | 403  |
| Resource not found           | 404  |
| Zod validation failure       | 422  |
| RPC or Supabase error        | 500  |

Do not use 200 for errors and do not use 500 for validation failures.

## Error responses

Never expose Supabase error messages, stack traces, or database details to the client. Log them server-side via `src/lib/logger.ts` and return a correlation ID.

```typescript
import { logger } from '@/lib/logger';
import { randomUUID } from 'crypto';

if (error) {
  const ref = randomUUID().slice(0, 8);
  logger.error('issue_key RPC failed', { ref, supabaseError: error.message });
  return NextResponse.json(
    {
      data: null,
      error: `Something went wrong. Reference: ${ref}`,
      status: 500,
    },
    { status: 500 }
  );
}
```

## What must never appear in a route

| Forbidden                                       | Reason                                              |
| ----------------------------------------------- | --------------------------------------------------- |
| `supabase.auth.getSession()` for auth decisions | Client-controllable; use `getUser()`                |
| Service-role key in any browser-reachable route | Bypasses RLS; server-only                           |
| Raw `fetch` to Supabase REST                    | Use the typed client from `src/lib/supabase/server` |
| `console.log`                                   | Use `src/lib/logger.ts`                             |
| Direct `INSERT` into `audit_log`                | Go through `src/lib/audit/`                         |
| Unvalidated `req.body` passed to Supabase       | Validate with Zod first                             |
| Two separate writes where an RPC exists         | Non-atomic; audit integrity at risk                 |

## Route checklist

Before merging a new or modified route:

- [ ] `getUser()` called before any business logic
- [ ] Role checked if the route is role-specific
- [ ] Request body parsed through Zod schema
- [ ] Mutations go through an RPC, not raw `.from().update()`
- [ ] Response matches `{ data, error, status }` envelope
- [ ] Errors log via `logger`, not `console.log`
- [ ] No stack traces or Supabase error messages in the response body
- [ ] `npm run typecheck && npm run lint` pass
