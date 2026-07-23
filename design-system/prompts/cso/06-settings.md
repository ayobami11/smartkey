# CSO Settings

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/cso/settings` — System and personal settings** screen.

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

---

## Generation request

Generate the CSO settings screen (`/cso/settings`). Note: the Operational, Risk rules, and Notifications sections are currently **static/demo** in the shipped app — they render real controls but aren't wired to a persistence API yet. Design them at full visual fidelity anyway (a Save button and all), just don't invent a "saved!" confirmation state for them beyond what's specified below.

**Layout**: left navigation (sticky on desktop, top tabs on mobile) with four sections: "Operational", "Risk rules", "Notifications", "Account".

**Section 1 — Operational**: operational hours per zone (two cards, one per zone), each with weekday and weekend rows using "From"/"To" time inputs (24-hour, default 06:00–22:00 weekday), and a "Closed" toggle for weekend hours that disables the time inputs when on. Below: a Return-deadline select (default "End of current day") and a Code-expiry numeric input (minutes, default 10). "Save operational settings" button at the bottom.

**Section 2 — Risk rules**: a table of the 5 real rule names with an editable weight (1–10 number input) and an enabled toggle per row: "Outside operational hours", "Outstanding key not returned", "Weekend without Dean memo", "Excess request frequency", "Collector not whitelisted". Below the table, a "Tier thresholds" card: Low ≤ N and Medium ≤ N number inputs, High > N shown read-only (derived). "Save risk rules" button.

**Section 3 — Notifications**: toggle list — "Anomaly alerts (in-app)", "Anomaly alerts (email)", "Signature mismatches (email)", "Daily digest at 08:00".

**Section 4 — Account**: profile card (photo upload with avatar + initials fallback, editable full name, read-only institutional email) and a separate "Change password" card (current/new/confirm fields with show/hide toggles).

Generate at 1440px (desktop) and 390px (mobile).
