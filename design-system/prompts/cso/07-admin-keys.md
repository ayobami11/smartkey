# CSO Administration Keys

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/cso/admin-keys` list + `/cso/admin-keys/:keyId` detail** screens. **This screen did not exist in the original prompt set.** It's the CSO-side mirror of the Dean's key/slot-management screens, for the Administration unit specifically (central Senate-Building offices — VC, DVCs, Registrar, Bursary, Librarian — which has no Dean, so the CSO is its authoriser).

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

## Flow: Collector authorisation

1. On `/cso/admin-keys`, tap a key tile → opens slot management for that key.
2. Tap a vacant slot (max 3) → search staff by name or email — candidates are all active Requester accounts system-wide, since Administration has no fixed unit staff list the way a faculty does.
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

Generate two screens: the Administration key grid and one key's detail/slot-management view.

**Screen 1 — Admin keys list (`/cso/admin-keys`)**: page heading "Administration Keys" with a header button linking to "Weekend Requests" (→ `/cso/weekend-requests`). A grid of key cards, one per CSO-authorised Administration key: key icon (amber-tinted if the key currently has zero collectors assigned, primary otherwise, with a small alert icon when fully vacant), code, room name, zone label, and a 3-dot collector-slot indicator reading "x/3 authorised". Tapping a card navigates to the detail screen. Loading = title + 6 skeleton cards. Empty: "No administration keys found."

**Screen 2 — Admin key detail (`/cso/admin-keys/:keyId`)**: a key header card (icon, code, zone badge, room/unit name, "x of 3 slots filled"). Below, a 3-column grid of slot cards:

- **Filled slot**: avatar with initials, name, email, the date authorised, and a "Remove" button that opens a confirmation dialog before calling the remove-authorisation action.
- **Vacant slot**: dashed placeholder with an "Add collector" button that reveals an inline picker — a select populated with active Requester profiles system-wide, plus Cancel/Add buttons.

Below the slot grid: a **transaction history** section, cursor-paginated ("Load more"), each row showing a status stripe/badge (Issued / Returned / Expired / Cancelled / Declined), a Weekday/Weekend tag, requester name, a return-line ("Due [time]" or "Returned [time]"), and the date. Empty: "No transaction history yet."

Toast confirmations on successful add/remove.

Use placeholder data: an Administration key "ADM-02, Registrar's Office" with 2 of 3 slots filled, and a transaction history of 4 mixed-status entries. Generate at 1440px (desktop) and 390px (mobile) for both screens.
