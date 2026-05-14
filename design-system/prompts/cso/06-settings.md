# CSO Settings

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/cso/settings` — System and personal settings** screen.

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

Generate the CSO settings screen (`/cso/settings`).

**Layout**: left navigation (sticky on desktop, top tabs on mobile) with four sections: "Operational", "Risk rules", "Notifications", "Account".

**Section 1 — Operational**:

- Operational hours per zone (two cards, one per zone). Each card has weekday and weekend rows with "From" and "To" time inputs (24-hour format, default 06:00–22:00 weekday, "Closed" toggle for weekend).
- Return deadline: dropdown (default "End of business day (17:00)", options: 17:00, 18:00, Custom).
- Code expiry: numeric input "minutes after generation" (default 10).
- Save button at the bottom of the section.

**Section 2 — Risk rules**:
A table of rule conditions with editable weights. Each row: rule name (read-only), description (read-only, plain English), weight (numeric input 1–10), enabled toggle.

Rules: "Outside operational hours", "Outstanding key not returned", "Weekend without HOD memo", "Excess request frequency", "Collector not whitelisted".

Below the table: "Tier thresholds" with three numeric inputs: Low ≤ N, Medium ≤ N, High > N. Defaults 3 / 6.

A small caption at the foot: "Changes apply to new requests only. Existing risk scores are not retroactively updated."

**Section 3 — Notifications**:
Toggle list: "Anomaly alerts (in-app)", "Anomaly alerts (email)", "Signature mismatches (email)", "Daily digest at 08:00".

**Section 4 — Account**:
Profile (name, email, photo upload), Theme (System / Light / Dark), Change password, Sign out (destructive button at bottom).

Save behaviour: every section has its own Save button. Changes are not saved until the section's Save is pressed (warn on tab change with unsaved changes via a dialog). All settings changes are logged to the audit log.

Generate at 1440px (desktop) and 390px (mobile).
