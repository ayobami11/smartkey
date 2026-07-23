# CSO Audit Log &amp; Incidents

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/cso/audit` — Audit Log and Incidents (tabbed)** screen.

---

## Project Context

SmartKey is a four-role web application replacing the paper-based key management workflow at the University of Lagos Senate Building. The roles are:

- **Chief Security Officer (CSO)**: senior administrator. Desktop-primary. Oversight, reports, audit log, user management.
- **Dean** (system role `DEAN`): faculty member. Mixed device usage. Authorises up to three collectors per unit key, signs weekend approvals. The Administration unit's keys are authorised by the CSO instead — no Dean exists for it.
- **Verifier (security personnel)**: 24/7 desk staff in 8-hour shifts. Shared desktop at the security desk. Issues and receives keys, performs shift handover.
- **Requester (university staff)**: lowest-frequency user. Phone-primary. Requests a key, receives a 6-digit code by email, presents it at the desk.

Three AI components run in the background: rule-based risk scoring (visible to verifiers as Low/Medium/High tier), Gemini-generated shift reports (CSO dashboard), and pixel-level signature verification (Dean-signed approvals). WCAG 2.2 AA conformance is the floor. Use the SmartKey design system from DESIGN.md — do not invent colours, typography, or component styling.

Grouping term: SmartKey organises keys by **Unit** (not "Department" or "Faculty").

## CSO area routes

- `/cso/dashboard` — Dashboard home (pending decisions, live per-zone key counts, anomaly/signature alerts, trend charts)
- `/cso/admin-keys` — Administration-unit key inventory + collector slot management
- `/cso/audit` — Audit Log and Incidents in one tabbed screen, searchable and filterable
- `/cso/users` — User list, provisioning, editing, revoking access
- `/cso/keys` — Key inventory across both zones; create keys, mark lost/retired
- `/cso/reports` — Generated shift reports (Gemini-produced) list + detail; comment, download PDF
- `/cso/settings` — Operational hours, risk-rule weights, notifications, account
- `/cso/weekend-requests` — Review queue for Administration-unit weekend requests

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

Generate the CSO audit screen (`/cso/audit`) — **this is one screen with two tabs**, "Audit Log" and "Incidents", not two separate pages.

**Header row**: page heading, a "Log incident" button (visible only on the Incidents tab — opens a right-side sheet), and an "Export CSV" button that exports whichever tab is currently active.

**Audit Log tab**:
Filter bar: a search-by-actor-name input (with a search icon), a Role multi-select dropdown (CSO / Dean / Verifier / Requester / **Guest** — guest-initiated events are a real category), an Event-type multi-select dropdown, and the shared TimeRangeFilter (preset chips + custom range + an "All time" option).

Below the filters, a data table with columns: event-type icon, Name, Role badge, Unit, event description (plain English, e.g. "Issued key NS-304 to Dr. Bakare") with a monospace key-code chip inline, and Time. Server-paginated with a page-size select (10/25/50/100) and numbered pagination with ellipsis for large ranges.

Loading = a skeleton table matching the column layout. Empty row = "No events match these filters."

**Incidents tab**:
Filter bar: Type multi-select, Severity multi-select, and the shared TimeRangeFilter. Below, a cursor-paginated list of incident rows: reference code (monospace, e.g. "INC-2026-0042"), severity pill, type, description, timestamp. Empty state: siren icon, "No incidents recorded." "Load more" button at the bottom.

**Log incident sheet** (right-side, opened from the header button): Type select (Missing key / Suspicious activity / Equipment fault / Procedural / Other), Severity select (an amber warning note appears when High is selected: "CSO will be notified immediately"), Description textarea. On submit, the sheet shows a success state with the generated incident reference and a "Log another" link.

Use placeholder data: 12 audit events spanning login → request → issue → anomaly → return, including one guest-initiated event (role shown as "Guest", no actor name in the Role column styling that other rows get). 4 incidents across severities. Generate at 1440px (desktop) — this is a power-user screen; mobile can be a simplified single-column read view.
