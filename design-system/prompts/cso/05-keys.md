# CSO Key Inventory

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/cso/keys` — Master key inventory** screen.

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

Generate the CSO key inventory screen (`/cso/keys`). This covers every key in the building — not just Administration keys (that's the separate `/cso/admin-keys` screen for collector-slot management specifically).

**Layout**: page heading "Key Inventory" with a primary "Add key" button on the right. A tab strip below the heading: "All", "New Senate", "Old Senate", "Outstanding", "Retired" (vertical tabs on desktop, horizontal scroll on mobile). A toolbar above the grid: a search input (matches code/room/unit) and a Unit-filter combobox.

**Non-Outstanding tabs**: a grid of key cards — key icon, code (monospace), an ellipsis menu ("Mark as lost" → opens the Mark-as-lost dialog), room name and unit, an optional "Keys on bunch: N" line, and a status pill (Available / Issued / Overdue / Retired). Empty state: key icon, "No keys found."

**Outstanding tab**: cards for currently-issued keys — requester name, issued/due times, an Issued or Overdue status pill, same "Mark as lost" ellipsis menu. Empty: "No keys currently issued."

**Add key dialog** ("Add key" button): fields — Key code (auto-uppercased, monospace input), Zone select, Room name, Unit select, "Keys on bunch" number input (optional, 1–20, for bunches like a porter's set). Success state: green check "Key added."

**Mark-as-lost dialog** (from the card's ellipsis menu): confirmation with a required "Lost note" textarea, and a warning that this action retires the key and opens a HIGH-severity incident automatically — irreversible. Destructive "Mark as lost" button.

Use placeholder data: 12 keys across both zones, mostly Available, 2 currently Issued, 1 Retired, one with a bunch count. Generate at 1440px (desktop) and 768px (tablet). Mobile is a read-only card list — full inventory editing is desktop-only.
