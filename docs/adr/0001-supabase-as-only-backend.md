# ADR 0001 — Supabase as the only backend

**Status**: accepted, 2026-05

## Context

SmartKey needs auth, database, realtime, storage, and email. We could compose these from separate vendors (Auth0 + Postgres + Pusher + S3 + SendGrid) or use a unified backend.

## Decision

Use Supabase for auth, database, realtime, and storage. Use Resend for email (Supabase's native email is sufficient for transactional but Resend gives us better template control for the activation and code emails).

## Consequences

- Single vendor to operate; reduces complexity for a research project with no dedicated DevOps.
- Supabase Realtime via Postgres replication is well-suited to the dashboard live-update pattern.
- RLS policies live alongside the schema in migrations; auth and authorisation are reviewed together.
- Risk: Supabase outage affects every part of the system. Mitigation: 99.5% uptime SLA is in line with our target; OfflineBanner UX explicit about degraded states.
- We commit to Postgres-flavoured SQL and Supabase RPC patterns. Migrating off in future would require reimplementing auth and realtime layers.
