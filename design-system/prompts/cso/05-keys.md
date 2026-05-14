# CSO Key Inventory

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/cso/keys` — Master key inventory** screen.

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

---

## Generation request

Generate the CSO key inventory screen (`/cso/keys`).

**Layout**: page heading "Key Inventory" with primary "Add key" button on the right. Tab navigation below the heading: "All", "New Senate" (default visible), "Old Senate", "Retired".

**Each zone view**:
Grid of KeyTile components (3-column desktop, 2-column tablet, 1-column mobile). Each tile shows: key code (code-md monospace, e.g., "NS-304"), room name ("Senate Room 304"), assigned department ("Faculty of Engineering"), HOD name, current status (badge: Available / Issued / Overdue / Retired), and a small kebab menu (Edit, Retire, View history).

Sort dropdown above the grid: "Code A→Z", "Recently used", "Most requested", "Status".

**Add key dialog** (modal):
Fields: Key code (required, format-validated as zone prefix + room number), Room name, Department (select from existing), Zone (radio: New Senate / Old Senate), Notes (optional textarea).

**Retire confirmation** (modal):
"Retire key [NS-304]?" "This key will no longer accept new requests. Existing requests will continue until returned. Retirement is logged to the audit trail and cannot be undone." Buttons: "Retire key" (destructive), "Cancel".

Use placeholder data: 12 keys across both zones, mostly available, with 2 currently issued and 1 retired.

Generate at 1440px (desktop) and 768px (tablet). Mobile is a read-only card list — full inventory editing is desktop-only.
