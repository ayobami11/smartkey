# ADR 0004 — Server Components by default

**Status**: accepted, 2026-05

## Context

Next.js 16 (App Router) supports React Server Components. Defaulting to RSC reduces client-side JS, improves performance, and keeps secrets (Supabase service key, Gemini API key) server-side by construction.

## Decision

Every component in `src/app/` and `src/components/smartkey/` is a Server Component unless it explicitly needs:

- React state or effects.
- Browser APIs (localStorage, navigator, etc.).
- Event handlers (onClick, onChange, etc.).

Client components are marked with `"use client"` at the top of the file. Mark only the leaf components that need interactivity, not entire pages.

Forms use server actions (`action={...}`) where possible; react-hook-form is reserved for genuinely complex client-side forms (multi-step wizards, dynamic field arrays).

## Consequences

- Smaller client bundles; better performance especially on mobile (the requester's primary device).
- Secrets cannot accidentally end up on the client; if you write a server-only call in a client component, you get a build error.
- Realtime subscriptions and live state still need client components; use the "islands" pattern — server-rendered shell with client-rendered live regions.
- Slight learning curve for contributors used to a single-environment React mental model.
