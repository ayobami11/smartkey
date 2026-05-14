# CSO Audit Log

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/cso/audit` — Searchable audit log** screen.

---

## Project Context

SmartKey is a four-role web application replacing the paper-based key management workflow at the University of Lagos Senate Building. The roles are:

- **Chief Security Officer (CSO)**: senior administrator. Desktop-primary. Oversight, reports, audit log, user management.
- **Head of Department (HOD)**: faculty member. Mixed device usage. Authorises up to three collectors per departmental key, signs weekend approvals.
- **Verifier (security personnel)**: 24/7 desk staff in 8-hour shifts. Shared desktop at the security desk. Issues and receives keys, performs shift handover.
- **Requester (university staff)**: lowest-frequency user. Phone-primary. Requests a key, receives a 6-digit code by email, presents it at the desk.

Three AI components run in the background: rule-based risk scoring (visible to verifiers as Low/Medium/High tier), Gemini-generated shift reports (CSO dashboard), and pixel-level signature verification (HOD signed approvals). WCAG 2.2 AA conformance is the floor. Use the SmartKey design system from DESIGN.md — do not invent colours, typography, or component styling.

## CSO area routes

- `/cso` — Dashboard home (live key counts per zone, anomaly alerts, today's events)
- `/cso/reports` — Generated shift reports (Gemini-produced); download, comment
- `/cso/audit` — Searchable, filterable audit log of every event
- `/cso/users` — User management (provision new accounts, deactivate)
- `/cso/keys` — Key inventory across both zones; create / retire key records
- `/cso/settings` — Operational hours, risk-rule weights, profile, theme

## Responsive breakpoints

- xs ≤ 480px (phone)
- sm 481–768px (large phone, small tablet)
- md 769–1024px (tablet, small laptop)
- lg 1025–1440px (standard desktop)
- xl > 1440px (wide desktop)

Generate the screen at xs (mobile) and lg (desktop) at minimum. Touch targets minimum 44×44px.

## State coverage required

For every async surface in this screen, design four states: empty, loading (skeleton placeholders, no layout shift), error (inline near the offending field, plus page-level fallback with correlation ID), and content.

If the screen depends on realtime data, also design the offline state: persistent OfflineBanner at top, destructive actions disabled with tooltip "Available again when you reconnect."

---

## Generation request

Generate the CSO audit log search screen (`/cso/audit`).

**Layout**: top filter bar (sticky), virtualised result list below.

**Filter bar**:

- Free-text search input (left, full-flex): "Search by user name, key code, or event ID"
- Event type multi-select dropdown: Request, Issue, Return, Anomaly, Handover, Login, Settings change, Signature verification.
- Zone filter: All / New Senate / Old Senate.
- Date range picker (presets: Today, Last 7 days, Last 30 days, Custom).
- User filter: search dropdown.
- "Reset filters" link on the right.

**Result list**:
Each row is a single-line card showing: event type icon (left), actor name and role, event description in plain English ("Issued key Senate-304 to Dr. Bakare"), key code monospace badge, timestamp (right, code-md JetBrains Mono "2026-05-01 14:32"). Tap to expand inline for the full event payload (collapsed JSON-style view of the structured event data, but rendered as a readable key-value list, not raw JSON).

Pagination: virtualised infinite scroll; small footer at the bottom of the visible list "Loaded 50 of 1,247 events. Scroll to load more."

**Empty state**: "No events match these filters." with primary "Reset filters" button.

**Loading state**: skeleton rows preserving height.

**Top-right of page**: "Export results" button (CSV download), only enabled when filters return ≤ 10,000 events.

Use placeholder data: 12 events spanning login → request → issue → anomaly → return events for one day. Include one expanded event showing the full payload structure. Generate at 1440px (desktop) only — this is a power-user screen, mobile is read-only and lower priority.
