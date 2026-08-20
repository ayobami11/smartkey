# Create a Supabase database migration

Add a new migration to `supabase/migrations/` with the standard SmartKey conventions.

Arguments: `$ARGUMENTS` (short description, e.g. `add-incidents-severity`)

Steps:

1. Read `docs/DATABASE.md` for current schema and conventions.
2. Generate a timestamped migration file: `supabase/migrations/$(date +%Y%m%d%H%M%S)_$ARGUMENTS.sql`.
3. Include in the migration:
   - The schema change (CREATE/ALTER/DROP).
   - RLS policies for every affected table (read, write, update — none for `audit_log` updates).
   - Indexes for any new query patterns.
   - A comment block at the top explaining the change in plain English.
4. If the change touches `audit_log`, require explicit confirmation — the audit log is append-only and changes here need a code review.
5. If the change adds a new event type, also update `src/lib/audit/events.ts` with the new event name and zod schema.
6. Update `docs/DATABASE.md` and `docs/CHANGELOG.md`.
7. Run `bun run db:migrate` against the local Supabase instance to verify the migration applies cleanly.
8. Run `bun run typecheck` to confirm generated types still match.

Show me the migration plan before writing the SQL.
