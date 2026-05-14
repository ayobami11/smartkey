# CSO Dashboard Home

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/cso` — CSO dashboard home** screen.

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

## Flow: CSO investigates an anomaly alert

1. From the dashboard alert feed, tap an alert.
2. The originating request opens with the contributing risk factors highlighted.
3. CSO can: contact the verifier, mark the alert as resolved with a note, or escalate to incident.

## Screen spec: CSO dashboard home

**Layout**: three-column desktop: left (LiveZoneCounter for both zones), centre (anomaly alert feed), right (today's key events stream). On smaller screens, right column collapses below.

**Required surfaces:**

- **LiveZoneCounter**: large numeric "X of Y keys checked out" per zone with trend arrow vs same time yesterday. Updates real-time.
- **Anomaly alert feed**: AnomalyAlertItem list, sorted by severity then recency. Severity stripe on the left of each card.
- **Events stream**: reverse-chronological list of all key events today (issued, returned, flagged). Tappable to open the related record.
- **Quick actions**: "Generate report now", "Search audit log", "View incidents".

## AI surface: Risk scoring engine

- **Treatment**: RiskTierBadge (pill with status colour + icon + tier label "Low" / "Medium" / "High"). At heading-md size — non-trivial.
- **Factor reveal**: a "View factors" link beneath the badge opens a popover listing each contributing rule with its weight in plain English ("Outside operational hours for New Senate (weight 3)").
- **High-risk gating**: explicit acknowledgement step inserted in the issue flow before the verifier can proceed.

## Notifications and realtime behaviour

- Persistent banners are for state that affects what the user can do (offline, onboarding incomplete, shift not handed over).
- Toasts are for transient confirmations only (3-second auto-dismiss). Never show critical information solely via toast.
- Realtime updates: small dot in app bar (green/amber/red) shows connection state.
- Notification centre: top-right bell icon with badge count.

## Responsive breakpoints

- xs ≤ 480px (phone)
- sm 481–768px (large phone, small tablet)
- md 769–1024px (tablet, small laptop)
- lg 1025–1440px (standard desktop)
- xl > 1440px (wide desktop)

Generate the screen at xs (mobile) and lg (desktop) at minimum. Touch targets minimum 44×44px.

---

## Generation request

Generate the CSO dashboard home (`/cso`) using the spec above.

**Placeholder data**:

- LiveZoneCounter: New Senate "12 of 47 keys checked out, +2 vs same time yesterday"; Old Senate "8 of 31 keys checked out, -1 vs same time yesterday".
- Anomaly alert feed (3 items, top-down by severity):
  - High: "Signature mismatch on weekend approval — Prof. Adeleke, Faculty of Sciences, 78% mismatch", 14:22.
  - Medium: "Outstanding key past return deadline — Old Senate Room 12, Dr. Bakare, issued 09:15 yesterday", 17:05.
  - Medium: "Request frequency exceeds rolling window — New Senate Room 304, 4 requests in 24h", 12:40.
- Events stream (5 items, today): key issued (Senate 304, 13:48), key returned (Senate 211, 13:22), high-risk request flagged (Senate 304, 12:40), shift handover completed (12:00), key issued (Senate 211, 11:05).
- Quick actions: "Generate report now", "Search audit log", "View incidents", "Provision user".

Generate at 1440px (desktop, three-column) and 390px (mobile, single column with stream collapsed). Show light mode primary; one section in dark mode for theme reference.
