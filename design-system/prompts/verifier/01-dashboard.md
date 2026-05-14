# Verifier Dashboard Home

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/verifier` — Verifier dashboard home (highest stakes)** screen.

---

## Project Context

SmartKey is a four-role web application replacing the paper-based key management workflow at the University of Lagos Senate Building. The roles are:

- **Chief Security Officer (CSO)**: senior administrator. Desktop-primary. Oversight, reports, audit log, user management.
- **Head of Department (HOD)**: faculty member. Mixed device usage. Authorises up to three collectors per departmental key, signs weekend approvals.
- **Verifier (security personnel)**: 24/7 desk staff in 8-hour shifts. Shared desktop at the security desk. Issues and receives keys, performs shift handover.
- **Requester (university staff)**: lowest-frequency user. Phone-primary. Requests a key, receives a 6-digit code by email, presents it at the desk.

Three AI components run in the background: rule-based risk scoring (visible to verifiers as Low/Medium/High tier), Gemini-generated shift reports (CSO dashboard), and pixel-level signature verification (HOD signed approvals). WCAG 2.2 AA conformance is the floor. Use the SmartKey design system from DESIGN.md — do not invent colours, typography, or component styling.

## Verifier area routes

- `/verifier` — Dashboard home: pending requests, outstanding keys, shift state
- `/verifier/issue` — Issue-key flow: enter code, confirm collector, mark issued
- `/verifier/return` — Receive-key flow: select outstanding key, confirm return
- `/verifier/handover` — Shift handover acknowledgement (locked screen until complete)
- `/verifier/incidents` — Log a new incident; review own shift history

## Flow: Verifier issues a key (highest-frequency flow)

1. Verifier enters the 6-digit code presented by the collector.
2. Screen reveals: collector name, photo, requested key, risk tier (factors expandable).
3. Verifier confirms identity match → taps "Issue key". Done. Persistent confirmation with timestamp.

If risk is High: an explicit acknowledgement step is inserted between 2 and 3, requiring the verifier to read the contributing factors before the Issue button enables.

## Flow: Verifier receives a returned key

1. From the outstanding-keys list, tap the relevant row.
2. Confirm key code matches; tap "Mark returned".
3. Confirmation persists; row removed from outstanding list.

## Flow: Verifier shift handover

The dashboard is locked behind the handover screen at the start of every new shift. Outgoing officer's shift summary at top; outstanding keys below as a checklist. Incoming officer must acknowledge each (or bulk-acknowledge with explicit confirmation) before the dashboard unlocks. Acknowledgement is logged with the incoming officer's identity and timestamp.

## Screen spec: Verifier dashboard home

**Layout**: top app bar with user identity and shift status; left primary column for the live request queue (60% on desktop); right column with outstanding keys (40% on desktop). On mobile: queue first, outstanding-keys collapsible below. Whole screen receives Realtime updates.

**Required surfaces:**

- **Shift status indicator**: top-left of app bar; current officer name, shift number, time elapsed. Tappable to view shift summary.
- **Live request queue**: each row a card showing requester name, key, time of request (relative: "2 min ago"), risk tier badge, primary CTA "Issue".
- **Outstanding keys**: each row showing key code, room, collector, time issued, expected return time, overdue badge if past.
- **Code entry shortcut**: persistent floating action containing the code input. On desktop: top-right of queue. On mobile: bottom sheet trigger.
- **Realtime indicator**: small green dot in app bar when synced; amber when reconnecting; red when offline.

**Behaviour:**

- New requests appear at top of queue with brief 200ms slide-in (respects reduce-motion).
- Overdue keys re-sort to top of outstanding list and gain a red overdue badge.
- Tapping a queue row opens a side sheet with full request detail and the issue flow.

## AI surface: Risk scoring engine

- **Treatment**: RiskTierBadge (pill with status colour + icon + tier label "Low" / "Medium" / "High"). At heading-md size — non-trivial.
- **Factor reveal**: a "View factors" link beneath the badge opens a popover listing each contributing rule with its weight in plain English ("Outside operational hours for New Senate (weight 3)").
- **High-risk gating**: explicit acknowledgement step inserted in the issue flow before the verifier can proceed.

## Notifications and realtime behaviour

- Persistent banners are for state that affects what the user can do (offline, onboarding incomplete, shift not handed over).
- Toasts are for transient confirmations only (3-second auto-dismiss). Never show critical information solely via toast.
- Realtime updates: small dot in app bar (green/amber/red) shows connection state.
- Notification centre: top-right bell icon with badge count.

## State coverage required

For every async surface in this screen, design four states: empty, loading (skeleton placeholders, no layout shift), error (inline near the offending field, plus page-level fallback with correlation ID), and content.

If the screen depends on realtime data, also design the offline state: persistent OfflineBanner at top, destructive actions disabled with tooltip "Available again when you reconnect."

## Responsive breakpoints

- xs ≤ 480px (phone)
- sm 481–768px (large phone, small tablet)
- md 769–1024px (tablet, small laptop)
- lg 1025–1440px (standard desktop)
- xl > 1440px (wide desktop)

Generate the screen at xs (mobile) and lg (desktop) at minimum. Touch targets minimum 44×44px.

---

## Generation request

Generate the verifier dashboard home (`/verifier`) using the spec above.

**Placeholder data**:

- Officer "Officer Musa", Shift 2 (08:00–16:00), 3h 22m elapsed.
- Realtime indicator: green (connected).
- Live request queue (4 items, top to bottom):
  - **High risk**: Dr. Adeleke, NS-304, "1 min ago". Factors visible: "Outside operational hours, Outstanding key not returned (weight 5)".
  - **Low**: Dr. Bakare, OS-12, "4 min ago".
  - **Medium**: Mrs. Okoro, NS-305, "8 min ago". Factors: "Excess request frequency in 24h (weight 2)".
  - **Low**: Eng. Adeyemi, NS-306, "12 min ago".
- Outstanding keys (5 items, top to bottom):
  - **Overdue (red badge)**: OS-11, Old Senate Room 11, Prof. Eze, issued yesterday 14:22, expected return 17:00 yesterday.
  - NS-304, Senate Room 304, Dr. Adeleke, issued 09:15, expected 17:00 today.
  - NS-305, Senate Room 305, Mrs. Okoro, issued 10:48, expected 17:00 today.
  - OS-13, Old Senate Room 13, Mr. Tunde, issued 11:30, expected 17:00 today.
  - NS-306, Senate Room 306, Eng. Adeyemi, issued 12:15, expected 17:00 today.
- Code entry shortcut: persistent in the top-right of the queue column on desktop; bottom-of-screen sheet trigger on mobile.

Generate four variants:

1. **Default** at 1440px (desktop, two-column).
2. **Mobile** at 390px (queue first, outstanding keys collapsed behind a tab).
3. **Offline state** (OfflineBanner at top, all primary actions disabled with tooltips).
4. **Dark mode** at 1440px (the desk runs overnight; this matters).
