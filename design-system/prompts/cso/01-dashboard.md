# CSO Dashboard Home

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/cso/dashboard` — CSO dashboard home** screen.

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

## AI surface: Risk scoring engine

- **Treatment**: RiskTierBadge — a pill with status colour + shield icon + tier label ("Low risk" / "Medium risk" / "High risk"). Non-trivial size, not a small decoration.
- **Factor reveal**: a "View factors" text-link beneath the badge opens a popover (RiskFactorPopover) listing each contributing rule in plain English with its numeric weight ("Outside operational hours — weight 3").
- **High-risk gating**: an explicit RiskAcknowledgement checkbox ("I have reviewed the contributing factors above.") is inserted in the issue flow before the verifier can proceed.

## AI surface: Signature verification

- **On match**: no UI surface. A subtle audit-log entry "Signature verified" is written and the approval proceeds automatically.
- **On mismatch (weekend approval)**: the approval is held rather than applied. A SignatureMismatchAlerts card surfaces on the CSO dashboard showing the reference signature and the submitted sample side by side with the mismatch percentage. The CSO can Decline or "Approve anyway" — the override is gated behind an explicit acknowledgement checkbox.
- **On mismatch (Dean replacing their own reference in Settings)**: the update is held for CSO review instead of applying immediately.
- Guest/external weekend requests never run signature verification — the Dean/CSO reviews the uploaded authorisation letter manually instead.

## Notifications and realtime behaviour

- Persistent banners are for state that affects what the user can do (offline, onboarding incomplete, shift not handed over).
- Toasts are for transient confirmations only (3-second auto-dismiss). Never show critical information solely via toast.
- Realtime updates: small dot in app bar (green connected / amber reconnecting / red offline) shows connection state.
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

Generate the CSO dashboard home (`/cso/dashboard`). This is the real, shipped widget set — six distinct cards plus a chart section, not the simpler three-column layout from an earlier draft. Match this structure.

**"Needs your attention" section** — a 2-column grid of four cards (stack to 1 column on mobile):

1. **PendingReview** — high-risk requests awaiting a CSO decision. Each row: red left-stripe card, shield-alert icon + "High risk" tag, relative time, key/room, requester name + their risk factors in plain English, and inline **Approve** / **Decline** buttons right on the card (no need to open a detail view for the common case). Loading = 3 skeleton rows; empty = "Queue is clear."
2. **SignatureMismatchAlerts** — held weekend approvals with a signature mismatch. Each card: file-warning icon + mismatch percentage, key, requester, "Review" button. Empty = "No signature mismatches."
3. **RiskAlerts** — read-only feed of HIGH-risk requests from the last 24 hours. Amber-striped cards, alert-triangle icon, risk tier, key, requester + factors. Empty = "No anomalies."
4. **WeekendRequests** — top 5 pending weekend requests for Administration-unit keys. Amber-striped rows, GuestBadge shown when the requester is external, ExpiredBadge if the date has passed, key code or "Key on approval" if not yet assigned, requested date, "Review" link. Header has a "View all" link → `/cso/weekend-requests`. Empty = "No pending requests."

**Signature Mismatch Detail Dialog** (opens from the "Review" button on card 2): modal with the reference signature and submitted signature shown side by side, the mismatch percentage and threshold as a banner, a RiskAcknowledgement-style checkbox, then Decline / "Approve anyway" buttons. Success state: check/x icon + "Approved/Declined. [Requester] has been notified by email."

**Live status section** — **KeysChart**: two donut/pie charts side by side, one per zone (New Senate, Old Senate), each with segments for Issued (slate), Available (emerald), Overdue (red), a centred total-keys label, and a legend with counts. Realtime-updated when any key's status changes.

**Trends section** — an **ActivitySection** with a `TimeRangeFilter` (preset chips: 24h / 7d / 30d / custom range via calendar popover) controlling two side-by-side charts: **IncidentsChart** (bar chart, incident counts by severity, colour-coded low/medium/high) and **EventsChart** (area chart of audit-log event volume over the selected range, with an event-type filter dropdown, realtime-updated).

**Placeholder data**:

- PendingReview (2 items): "Prof. Adeleke, weekend signature mismatch, 78%"; "Dr. Bakare, NS-304, outside operational hours + outstanding key not returned (weight 8)".
- SignatureMismatchAlerts (1 item): "Prof. Adeleke, requested Sat 3 May, 78% mismatch (threshold 15%)".
- RiskAlerts (2 items): "Mrs. Okoro, NS-305, excess request frequency (weight 2)"; "Eng. Adeyemi, OS-11, outside operational hours (weight 3)".
- WeekendRequests (3 items): mix of a GuestBadge row and two registered-requester rows, one with ExpiredBadge.
- KeysChart: New Senate 12 issued / 33 available / 2 overdue of 47; Old Senate 8 issued / 22 available / 1 overdue of 31.
- ActivitySection: 7-day range selected, incidents 2 low / 1 medium / 0 high, events trending upward toward end of week.

Generate at 1440px (desktop) and 390px (mobile, stacked single column). Show light mode primary; one section in dark mode for theme reference.
