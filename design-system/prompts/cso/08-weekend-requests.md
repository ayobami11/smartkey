# CSO Weekend Requests

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/cso/weekend-requests`** screen. **This screen did not exist in the original prompt set.** It's the CSO's equivalent of the Dean's weekend-request review queue (see `dean/04-weekend-requests.md`), scoped to Administration-unit requests.

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

## Flow: Guest/external weekend access request

1. An external person with no SmartKey account visits `/weekend-access`.
2. They submit their details, a declared ID document, the unit they need access within, requested room, weekend date, and an uploaded authorisation letter.
3. On submit, the guest reaches a session-less status page via an unguessable access token.
4. When routed to Administration, the **CSO** (not a Dean) reviews the uploaded letter, assigns a specific key, and approves or declines. No signature verification runs for guests.
5. On the requested date, the guest mints their own collection code, then a return code after collecting the key.

## AI surface: Signature verification

- **On match**: no UI surface; a subtle audit-log entry "Signature verified".
- **On mismatch**: the approval is held; the CSO dashboard's SignatureMismatchAlerts card surfaces the reference and submitted signatures side by side with the mismatch percentage. The CSO can Decline or "Approve anyway" behind an explicit acknowledgement.
- Guest requests never run signature verification — the CSO reviews the uploaded letter manually.

## Responsive breakpoints

- xs ≤ 480px (phone)
- sm 481–768px (large phone, small tablet)
- md 769–1024px (tablet, small laptop)
- lg 1025–1440px (standard desktop)
- xl > 1440px (wide desktop)

Generate the screen at xs (mobile) and lg (desktop) at minimum. Touch targets minimum 44×44px.

---

## Generation request

Generate the CSO weekend-requests screen (`/cso/weekend-requests`). List + detail sheet.

**List**: a vertical list of pending weekend requests for Administration keys, each row colour-striped by state: grey for an expired-but-undecided request (ExpiredBadge shown), red/amber/emerald matching the RiskTierBadge for High/Medium/Low, GuestBadge shown for external requesters. Each row shows: the key code, or "Key on approval" if not yet assigned (guest requests have no key until the CSO assigns one), the RiskTierBadge, relative submission time, requester name, requested date, and a "Review" button (disabled with a tooltip when offline). Empty state: inbox icon, "No pending requests."

**Detail sheet** (right side on desktop, full-screen on mobile), opened by "Review":

- **Identity block**: avatar with initials, requester name and email — for a guest, additionally show the declared ID document type/number, phone, and a "View authorisation letter" button (opens the uploaded letter).
- **Request details block**: key code + room (or "Not yet assigned"), the requested room description the guest/requester gave, the requested date with an ExpiredBadge if it's passed.
- **Key assignment select** — shown only for guest requests: a select of Administration keys to assign before approving.
- **High-risk warning banner** (amber) shown when the request's risk tier is High.
- Optional note textarea.
- **Approve** / **Decline** buttons (both disabled while offline or if the request has already expired).

**Decision success state**: check or X icon, "Approved/Declined. [Requester] has been notified by email." "Done" button.

Use placeholder data: 3 pending requests — one registered requester (Low risk), one guest with an unassigned key and ID document details, one expired-and-undecided row shown with its grey stripe and ExpiredBadge. Generate at 1440px (desktop) and 390px (mobile).
