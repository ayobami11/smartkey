# Dean Key Slot Management

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/dean/keys/:keyId` — Manage authorised collectors for a key** screen.

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

## Responsive breakpoints

- xs ≤ 480px (phone)
- sm 481–768px (large phone, small tablet)
- md 769–1024px (tablet, small laptop)
- lg 1025–1440px (standard desktop)
- xl > 1440px (wide desktop)

Generate the screen at xs (mobile) and lg (desktop) at minimum. Touch targets minimum 44×44px.

---

## Generation request

Generate the Dean key slot management screen (`/dean/keys/:keyId`).

**Layout**: top app bar with back chevron to `/dean/keys`. Below: a key header card (key code, room name, zone, "x of 3 slots filled").

**Main content**: three slot cards in a row (stack on mobile). Each slot card is either:

- **Filled**: avatar with initials, name, email, the date authorised, and a "Remove" button (destructive-ghost) that opens a confirmation dialog: "Remove [name] from [key code]? This revokes their authorisation immediately. Outstanding requests are not affected." before actually removing.
- **Vacant**: dashed border, a large "+ Add collector" button that reveals an inline picker — a search-select of active Requester accounts **within the Dean's own unit only** (not system-wide — that's the CSO's Administration variant), plus Cancel/Add buttons.

Below the slot cards: a **transaction history** section for this specific key, cursor-paginated ("Load more"), each row showing a status stripe/badge (Issued / Returned / Expired / Cancelled / Declined), a Weekday/Weekend tag, requester, a return-line, and the date. Empty: "No transaction history yet."

Toast confirmations on successful add/remove.

Use placeholder data: NS-304, two filled slots (Dr. Bakare, Eng. Adeyemi), one vacant slot, and a 3-item transaction history. Generate at 1440px (desktop) and 390px (mobile).
