# Requester Settings

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/requester/settings`** screen — **two sections, Account and Notifications, not the four the original prompt described.**

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

Generate the requester settings screen (`/requester/settings`). Two tab sections (vertical tabs on desktop ≥1024px, horizontal tabs below that) — "Account" and "Notifications".

**Section 1 — Account**: a profile card with photo upload (avatar + "Update photo" / "Remove photo", the latter behind a confirmation dialog), Full name (editable), Institutional email (read-only, "can't be changed"), Unit (read-only, "Managed by your CSO"), and an "Update profile" button enabled only once something has actually changed. A separate card below: "Change password" (current/new/confirm password fields with show/hide toggles).

**Section 2 — Notifications**: a list of 4 toggles, each with a description and a channel label: "Collection code generated" (email — this one is a read-only always-on toggle, with a footnote explaining the code email can't be disabled since it carries the code itself), "Key issued confirmation" (in-app), "Return deadline reminder" (email), "Weekend request decided" (email). A "Save notification settings" button at the bottom — note this section is currently client-state only in the shipped app, not wired to a persistence endpoint; design it at full fidelity regardless.

Use placeholder data: Requester "Dr. Bakare, Faculty of Engineering". Generate at 390px (mobile, primary) and 1440px (desktop).
