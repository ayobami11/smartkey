# Verifier Incident Log

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/verifier/incidents` — Log a new incident, review history** screen.

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

## Responsive breakpoints

- xs ≤ 480px (phone)
- sm 481–768px (large phone, small tablet)
- md 769–1024px (tablet, small laptop)
- lg 1025–1440px (standard desktop)
- xl > 1440px (wide desktop)

Generate the screen at xs (mobile) and lg (desktop) at minimum. Touch targets minimum 44×44px.

---

## Generation request

Generate two screens: incident list and create-incident form.

**Screen 1 — Incident list (`/verifier/incidents`)**:
Layout: page heading "Incidents" with primary "Log new incident" button on the right. Tabs: "This shift" (default), "All my shifts", "Unresolved".

Each incident as a card row: incident type icon (left), summary line (e.g., "Missing key NS-205 — flagged at 11:22"), short description (truncated 80 chars), status badge (Open / Resolved / Escalated), time logged. Tap to expand inline.

**Empty state**: "No incidents this shift. That's a good thing." with the "Log new incident" button.

**Screen 2 — Create incident form** (modal or full-screen sheet):
Title: "Log incident". Fields:

- Incident type (select): Missing key, Suspicious activity, Equipment fault, Procedural issue, Other.
- Related key (search-and-select; optional)
- Related person (search-and-select; optional)
- Time of occurrence (defaults to now; editable)
- Description (textarea, required, min 30 chars, max 1000)
- Severity (radio: Low / Medium / High)
- Photo attachment (optional, drag-drop, max 5MB)

Below the form: helper text "Incidents are immutable once submitted. Double-check before logging." Primary "Log incident" button, secondary "Cancel".

**Submitted state**: success card "Incident logged at 14:32. Reference: INC-2026-0042. Forwarded to CSO." with primary "Done" button → returns to the list with the new item at top.

Use placeholder data: 3 incidents this shift (1 missing key open, 1 procedural resolved, 1 suspicious activity escalated). Generate at 1440px (desktop) and 390px (mobile).
