---
name: audit-log-discipline
description: Use this skill whenever you write, modify, or read code that performs an action with operational consequences — creating a request, issuing or returning a key, approving or declining a memo, provisioning or deactivating a user, changing system settings, logging an incident. Enforces the audit-log integrity rules that the project's value depends on.
---

# Audit log discipline

The entire purpose of SmartKey is replacing an unaccountable paper trail with an immutable, queryable digital one. The audit log is the system's evidentiary backbone. Treat it accordingly.

## Three rules

### 1. Every consequential action writes an audit entry

Consequential = anything an investigator might later want to know happened. The list:

| Domain        | Events                                                                                                    |
| ------------- | --------------------------------------------------------------------------------------------------------- |
| Auth          | login, logout, MFA challenge, password reset, account provisioned, account activated, account deactivated |
| Requests      | request created, code generated, code expired, code refreshed, request cancelled                          |
| Keys          | key issued, key returned, key marked overdue, key retired                                                 |
| Approvals     | weekend request submitted, weekend request approved, weekend request declined                             |
| Authorisation | collector authorised, collector replaced, collector removed                                               |
| Shifts        | shift handover started, key acknowledged, shift handover completed                                        |
| AI            | risk score computed, signature verification run, signature mismatch detected                              |
| CSO           | report generated, report comment added, anomaly resolved, settings changed                                |
| Incidents     | incident logged, incident resolved, incident escalated                                                    |

If your code performs one of these and does not write an audit entry, that is a bug — fix before merge.

### 2. Audit writes are atomic with state writes

The audit entry and the state change must succeed or fail together. **Always use a Postgres transaction or a Supabase RPC.** Never write the state change first and the audit entry second as separate calls — that allows partial states.

```ts
// ❌ NEVER
await supabase.from('requests').update({ status: 'issued' }).eq('id', id);
await supabase.from('audit_log').insert({ event: 'key_issued', ... });

// ✅ ALWAYS — RPC that wraps both writes in a transaction
await supabase.rpc('issue_key', { request_id: id, verifier_id: userId });
```

The RPCs live in `supabase/migrations/` and are tested in `supabase/tests/`.

### 3. The audit log is append-only

- No row in `audit_log` is ever updated or deleted.
- The CSO can add **comments** to a generated shift report; comments are separate audit entries that reference the report. They do not modify it.
- An incident can be marked resolved; that is a new audit entry, not an edit.
- RLS policy on `audit_log` denies UPDATE and DELETE for every role including service. Migrations that touch this policy require a code review.

## Writing an audit entry

Always go through `src/lib/audit/`:

```ts
import { audit } from '@/lib/audit';

await audit.write({
  event: 'key_issued',
  actor_id: verifierId,
  target_type: 'request',
  target_id: requestId,
  payload: {
    key_code: 'NS-304',
    collector_id: collectorId,
    risk_tier: 'low',
  },
});
```

The writer enforces:

- Required fields (event, actor_id, timestamp).
- Allowed event names (a TS string-literal union; new events are added to the union explicitly).
- Payload schema per event type (zod schemas in `src/lib/audit/events.ts`).

## Reading the audit log

The CSO audit log surface (`/cso/audit`) is the only place the audit log is read in the UI. Reads go through `src/lib/audit/query.ts` which:

- Enforces filters server-side.
- Paginates with cursor-based pagination (offset pagination is forbidden — too slow at scale).
- Returns the structured event payload alongside the rendered display string.

## Common mistakes

- Forgetting to write an audit entry on a new action. Always grep for `audit.write` in any new mutation; if there's none, you've missed it.
- Using `console.log` in place of an audit entry "for now". The audit log is not a debug log — use `src/lib/logger.ts` for diagnostics.
- Writing audit entries from the client. **Audit writes happen server-side only.** Client code calls a server action or an RPC; the server is what writes.
