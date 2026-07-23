# Requester History

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/requester/history`** screen.

---

## Project Context

SmartKey is a four-role web application replacing the paper-based key management workflow at the University of Lagos Senate Building. The roles are:

- **Chief Security Officer (CSO)**: senior administrator. Desktop-primary. Oversight, reports, audit log, user management.
- **Dean** (system role `DEAN`): faculty member. Mixed device usage. Authorises up to three collectors per unit key, signs weekend approvals. The Administration unit's keys are authorised by the CSO instead — no Dean exists for it.
- **Verifier (security personnel)**: 24/7 desk staff in 8-hour shifts. Shared desktop at the security desk. Issues and receives keys, performs shift handover.
- **Requester (university staff)**: lowest-frequency user. Phone-primary. Requests a key, receives a 6-digit code by email, presents it at the desk.

Three AI components run in the background: rule-based risk scoring (visible to verifiers as Low/Medium/High tier), Gemini-generated shift reports (CSO dashboard), and pixel-level signature verification (Dean-signed approvals). WCAG 2.2 AA conformance is the floor. Use the SmartKey design system from DESIGN.md — do not invent colours, typography, or component styling.

Grouping term: SmartKey organises keys by **Unit** (not "Department" or "Faculty").

## Requester area routes

- `/requester/dashboard` — Dashboard home: active collection-code banner, outstanding keys, authorised keys grid, weekend requests panel
- `/requester/request/:requestId/code` — Active collection-code display with countdown
- `/requester/history` — Personal history of past requests
- `/requester/settings` — Account (incl. photo), notifications

## Responsive breakpoints

- xs ≤ 480px (phone)
- sm 481–768px (large phone, small tablet)
- md 769–1024px (tablet, small laptop)
- lg 1025–1440px (standard desktop)
- xl > 1440px (wide desktop)

Generate the screen at xs (mobile) and lg (desktop) at minimum. Touch targets minimum 44×44px.

---

## Generation request

Generate the requester history page (`/requester/history`).

**Layout**: full page, heading "Request history."

**Loading**: 5 skeleton rows matching the card shape below.

**Error**: "Failed to load history" card with a "Try again" button.

**Empty**: history icon, "No requests yet," body "Your request history will appear here."

**Content — request list**: each row is a card with a status stripe/badge — use these exact 7 statuses and their treatments: **PENDING_HOD** (amber/secondary, "Pending approval"), **APPROVED** (teal, "Approved"), **CODE_ISSUED** (blue, "Code issued"), **KEY_ISSUED** (primary maroon, "Key issued"), **KEY_RETURNED** (outline, "Returned"), **EXPIRED** (slate/muted, "Expired"), **CANCELLED** (orange, "Cancelled"), **DECLINED** (destructive, "Declined") — plus key code, room, the created date, and a trailing type tag ("Weekday" or "Weekend").

Below the list: a "Load more" button (cursor-based pagination).

Use placeholder data: 8 requests spanning most of the statuses above, mixing Weekday and Weekend types. Generate at 390px (mobile, primary) and 1440px (desktop).
