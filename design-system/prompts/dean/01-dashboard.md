# Dean Dashboard Home

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/dean/dashboard` — Dean dashboard home** screen.

---

## Project Context

SmartKey is a four-role web application replacing the paper-based key management workflow at the University of Lagos Senate Building. The roles are:

- **Chief Security Officer (CSO)**: senior administrator. Desktop-primary. Oversight, reports, audit log, user management.
- **Dean** (system role `DEAN`): faculty member. Mixed device usage. Authorises up to three collectors per unit key, signs weekend approvals. The Administration unit's keys are authorised by the CSO instead — no Dean exists for it.
- **Verifier (security personnel)**: 24/7 desk staff in 8-hour shifts. Shared desktop at the security desk. Issues and receives keys, performs shift handover.
- **Requester (university staff)**: lowest-frequency user. Phone-primary. Requests a key, receives a 6-digit code by email, presents it at the desk.

Three AI components run in the background: rule-based risk scoring (visible to verifiers as Low/Medium/High tier), Gemini-generated shift reports (CSO dashboard), and pixel-level signature verification (Dean-signed approvals). WCAG 2.2 AA conformance is the floor. Use the SmartKey design system from DESIGN.md — do not invent colours, typography, or component styling.

Grouping term: SmartKey organises keys by **Unit** (not "Department" or "Faculty").

## Dean area routes

- `/dean/dashboard` — Dashboard home: pending weekend requests, recent key activity, collectors table (no key grid here — that moved to its own route)
- `/dean/keys` — Unit key inventory grid
- `/dean/keys/:keyId` — Manage authorised collectors (max 3) for one key
- `/dean/weekend-requests` — Review and decide weekend access requests (registered and guest)
- `/dean/onboarding` — One-time signature and stamp upload, forced on first login
- `/dean/settings` — Account, signature & stamp replacement, notifications

## Flow: Collector authorisation

1. On `/dean/keys`, tap a key tile → opens slot management for that key.
2. Tap a vacant slot (max 3) → search staff by name or email within the Dean's own unit; select.
3. Confirm authorisation; the staff member is now whitelisted for that key.

## Flow: Weekend access request review (Dean)

1. On `/dean/dashboard`, the weekend-requests panel shows pending items with a badge count.
2. Tap a request → detail sheet shows requester/guest, key, date, description.
3. Choose Approve or Decline (with an optional note). For a registered requester with an uploaded signature, approval runs signature verification first — a mismatch holds the approval for CSO review instead of applying it.

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

Generate the Dean dashboard home (`/dean/dashboard`). **Important structural note**: this dashboard does **not** show a key grid — the key grid moved to its own `/dean/keys` route. This dashboard shows three widgets, stacked vertically, none of them a key grid.

**Greeting header**: "Good morning/afternoon/evening, [Name]." with the Dean's unit name as a subtitle.

**Widget 1 — Weekend requests panel**: near-identical treatment to the CSO dashboard's version — amber-striped rows for pending weekend requests, GuestBadge for external requesters, ExpiredBadge if the date passed, key code or "Key on approval" for unassigned guest requests, requested date, a "Review" link. Header "View all" link → `/dean/weekend-requests`. Empty: "No pending requests right now."

**Widget 2 — Recent activity**: a feed of the unit's key transactions, rendered as one-line past-tense narrative sentences (e.g. "Dr. Bakare collected the key for Senate Hall A (NS-304)"), each with a status stripe/badge (Issued / Returned / Expired / Cancelled / Declined) and a relative timestamp. Empty: "No key activity yet."

**Widget 3 — Collectors table**: a table of the unit's keys and their authorised-collector slots — grouped rows per key (Key / Name / Email / Date assigned) using row-span for the key column, with any unfilled slots summarised as an italic amber row spanning the remaining columns ("2 slots unassigned"). Realtime-refetched when authorisations change. Header "View all" link → `/dean/keys`. Empty: "No keys assigned to your unit yet. Contact the CSO."

Use placeholder data: Dean "Prof. Okonkwo, Faculty of Engineering". Weekend requests (2 items). Recent activity (4 items). Collectors table (3 keys, one fully filled, one with 1 vacant slot, one with 2 vacant slots).

Generate at 1440px (desktop) and 390px (mobile, stacked). Show light mode primary; one section in dark mode for theme reference.
