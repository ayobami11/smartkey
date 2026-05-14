# Add a new audit log event type

Register a new event in the SmartKey audit log.

Arguments: `$ARGUMENTS` (event name in snake_case, e.g. `weekend_request_extended`)

Steps:

1. Read `.claude/skills/audit-log-discipline/SKILL.md` for the full discipline rules.
2. Add the event name to the `AuditEvent` string-literal union in `src/lib/audit/events.ts`.
3. Define a zod schema for the event's `payload` shape in the same file. Include only the fields needed for later queries — minimise payload size.
4. Update the audit RPC in `supabase/migrations/` if the event needs server-side validation.
5. Add a unit test for the new event's writer in `src/lib/audit/audit.test.ts`.
6. Update `docs/AUDIT_EVENTS.md` with a one-line description.
7. Run `npm run typecheck && npm test`.

Show me the changes before writing.
