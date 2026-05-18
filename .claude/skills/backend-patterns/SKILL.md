---
name: backend-patterns
description: Use this skill when building server-side logic in SmartKey — Supabase RPCs, Edge Functions, background jobs, typed client usage, service layer organisation, error handling, and logging. Covers the serverless monolith constraints that shape every backend decision.
---

# Backend patterns

SmartKey is a serverless monolith: all server-side logic lives in Next.js API routes (deployed as Vercel functions) backed by Supabase. There is no separate backend server. This is a deliberate architectural choice — read `docs/ARCHITECTURE.md` before introducing patterns that assume a long-running process or a separate service.

## Architecture constraints to keep in mind

- **No persistent in-memory state** — each API route invocation is stateless. Caches, queues, and timers that live in module scope do not survive across invocations on Vercel.
- **No direct Supabase calls from the browser** — all writes go through API routes or Server Actions. The service-role key never leaves the server.
- **Background jobs run as Supabase Edge Functions** — not as `setTimeout`, not as worker threads, not as a separate cron server.
- **Multi-table mutations are RPCs** — if a state change must also write an audit entry, it goes in a Postgres function. See `docs/DATABASE.md` for all defined RPCs.

## Typed Supabase client

Always import the typed client, never instantiate it inline.

```typescript
// Server (API routes, Server Components, Server Actions)
import { createServerClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  // supabase is fully typed against the database schema
}
```

```typescript
// Client (hooks, Client Components)
import { createBrowserClient } from '@/lib/supabase/client'

const supabase = createBrowserClient()
// Use only for reads and Realtime subscriptions — never for writes that bypass RLS
```

```typescript
// WRONG: instantiating inline with the raw package
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(url, key) // no type safety, no cookie handling
```

## Service layer pattern

Business logic that is reused across multiple routes lives in `src/lib/` as a pure function or a small class. API routes stay thin — they validate input, call a service function, and return the result.

```typescript
// src/lib/requests/create-request.ts
import { createServerClient } from '@/lib/supabase/server'
import { type Database } from '@/types/database'

type CreateRequestInput = {
  keyId: string
  requesterId: string
  type: 'WEEKDAY' | 'WEEKEND'
  returnDeadline: Date
}

export const createRequest = async (input: CreateRequestInput) => {
  const supabase = await createServerClient()

  const { data, error } = await supabase.rpc('create_request', {
    p_key_id: input.keyId,
    p_requester_id: input.requesterId,
    p_type: input.type,
    p_return_time: input.returnDeadline.toISOString(),
  })

  if (error) throw new Error(error.message)
  return data
}
```

```typescript
// src/app/api/requests/route.ts — thin route
import { createRequest } from '@/lib/requests/create-request'

export async function POST(req: NextRequest) {
  // auth + validation above
  const result = await createRequest(parsed.data)
  return NextResponse.json({ data: result, error: null, status: 201 }, { status: 201 })
}
```

## RPC design rules

RPCs in `supabase/migrations/` handle all multi-table mutations. When writing a new RPC:

1. Wrap the body in `BEGIN ... EXCEPTION ... END` so any error rolls back all writes.
2. Insert the audit log entry inside the same transaction.
3. Return a typed JSONB object that the TypeScript caller can discriminate on.
4. Raise exceptions with a descriptive message — the TS layer converts them to user-facing errors.

```sql
CREATE OR REPLACE FUNCTION issue_key(
  p_request_id UUID,
  p_verifier_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request requests%ROWTYPE;
BEGIN
  SELECT * INTO v_request FROM requests WHERE id = p_request_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request % not found', p_request_id;
  END IF;

  IF v_request.status <> 'CODE_ISSUED' THEN
    RAISE EXCEPTION 'Request is not in CODE_ISSUED state';
  END IF;

  UPDATE requests
  SET status = 'KEY_ISSUED', issued_by = p_verifier_id, issued_at = NOW()
  WHERE id = p_request_id;

  INSERT INTO audit_log (event, actor_id, actor_role, target_type, target_id, payload)
  SELECT
    'key_issued',
    p_verifier_id,
    p.role,
    'request',
    p_request_id,
    jsonb_build_object('key_id', v_request.key_id, 'requester_id', v_request.requester_id)
  FROM profiles p WHERE p.id = p_verifier_id;

  RETURN jsonb_build_object('request_id', p_request_id, 'issued_at', NOW());
EXCEPTION
  WHEN OTHERS THEN
    RAISE; -- rolls back; caller receives the error
END;
$$;
```

## Error handling

Use the logger from `src/lib/logger.ts` — never `console.log` or `console.error`.

```typescript
import { logger } from '@/lib/logger'

try {
  const result = await issueKey({ requestId, verifierId })
  return NextResponse.json({ data: result, error: null, status: 200 })
} catch (err) {
  const ref = crypto.randomUUID().slice(0, 8)
  logger.error('issue_key failed', {
    ref,
    requestId,
    verifierId,
    message: err instanceof Error ? err.message : String(err),
  })
  return NextResponse.json(
    { data: null, error: `Something went wrong. Reference: ${ref}`, status: 500 },
    { status: 500 },
  )
}
```

Stack traces and Supabase error messages never reach the client response body.

## Background jobs (Edge Functions)

Jobs that must run on a schedule — overdue key checks, daily shift summaries — live in `supabase/functions/` as Deno Edge Functions with a cron trigger. Never approximate this with a `setTimeout` in a route or a client-side `useEffect` timer.

```typescript
// supabase/functions/overdue-key-check/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Mark overdue: status='out' AND expected_return < now()
  const { error } = await supabase.rpc('mark_overdue_keys')

  if (error) {
    console.error('mark_overdue_keys failed', error.message)
    return new Response('error', { status: 500 })
  }

  return new Response('ok')
})
```

Register the cron schedule in `supabase/config.toml`:

```toml
[functions.overdue-key-check]
schedule = "0 * * * *"  # hourly
```

## Query discipline

Select only the columns you need. Avoid `select('*')` in production code — it pulls unneeded data and breaks when columns are renamed.

```typescript
// GOOD
const { data } = await supabase
  .from('requests')
  .select('id, status, key_id, requester_id, risk_tier')
  .eq('status', 'CODE_ISSUED')
  .order('created_at', { ascending: false })

// BAD
const { data } = await supabase.from('requests').select('*')
```

Batch lookups to avoid N+1 queries. If you need user details for a list of requests, join in the select — do not loop and fetch one by one.

```typescript
// GOOD: single query with join
const { data } = await supabase
  .from('requests')
  .select('id, status, profiles!requester_id(full_name, photo_url)')
  .eq('status', 'CODE_ISSUED')

// BAD: N+1
for (const request of requests) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', request.requester_id)
    .single()
}
```

## Environment variables

Risk weights, thresholds, and operational hours are stored as environment variables — not hardcoded. Read them via `process.env` on the server only; never access `SUPABASE_SERVICE_ROLE_KEY` from client code.

| Variable | Purpose | Default |
|---|---|---|
| `SUPABASE_URL` | DB connection | required |
| `SUPABASE_ANON_KEY` | Public client | required |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions only | required |
| `GEMINI_API_KEY` | Shift reports | required |
| `RISK_SCORE_THRESHOLD` | Risk engine cutoff | `0.60` |
| `SIGNATURE_DIFF_THRESHOLD` | Pixel mismatch tolerance | `0.15` |
| `OPERATING_HOURS_START` | Risk rule reference | `07:00` |
| `OPERATING_HOURS_END` | Risk rule reference | `18:00` |

## Backend checklist

Before merging server-side code:

- [ ] Using typed Supabase client from `src/lib/supabase/server` (not inline instantiation)
- [ ] Multi-table mutations go through an RPC
- [ ] Audit log entry inside the same RPC transaction as the state change
- [ ] Errors logged via `logger`, not `console.log`; no internal details in the response
- [ ] No `select('*')` in production paths
- [ ] No N+1 queries — use joins or `.in()` batch lookups
- [ ] Scheduled work is an Edge Function, not a timer in a route
- [ ] Service-role key never used from browser-reachable code
- [ ] `npm run typecheck && npm run lint` pass
