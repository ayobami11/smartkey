# Dean Key Inventory

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/dean/keys` — Unit key inventory grid** screen. **This screen did not exist as its own file before** — it was previously folded into the dashboard spec, but the key grid moved to its own standalone route (see `01-dashboard.md`'s note).

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

## Responsive breakpoints

- xs ≤ 480px (phone)
- sm 481–768px (large phone, small tablet)
- md 769–1024px (tablet, small laptop)
- lg 1025–1440px (standard desktop)
- xl > 1440px (wide desktop)

Generate the screen at xs (mobile) and lg (desktop) at minimum. Touch targets minimum 44×44px.

---

## Generation request

Generate the Dean's key inventory screen (`/dean/keys`).

**Heading**: "[Unit name] Keys" (e.g. "Faculty of Engineering Keys") with a subtitle "Manage authorised collectors for each key."

**Grid**: a responsive grid of key cards (1 column on mobile, 2 on tablet, 3 on desktop) — key icon (amber-tinted when the key currently has zero collectors, to draw attention), code (monospace), room name, zone label ("New Senate" / "Old Senate"), and a 3-dot collector-slot indicator with "x/3 authorised" beneath it. Each card links to `/dean/keys/:keyId`.

Loading = 4 skeleton cards. Empty state: "No keys assigned to your unit yet. Contact the CSO." with a "Contact CSO" secondary action.

Use placeholder data: 6 keys (e.g. NS-304, NS-305, NS-306, OS-11, OS-12, OS-13) with a mix of fully-filled, partially-filled, and one fully-vacant key shown with the amber-tinted icon. Generate at 1440px (desktop, 3-column) and 390px (mobile, 1-column).
