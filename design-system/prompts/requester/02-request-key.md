# Requester Request-Key Sheet

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **weekday key-request sheet**, opened from the "Request" button on an authorised key row in `/requester/dashboard`. There is no standalone `/requester/request/:keyId` route — this is a Sheet, not a page.

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

- `/requester/dashboard` — Dashboard home: active collection-code banner, outstanding keys, authorised keys grid, weekend requests panel. Weekday and weekend requests both open as Sheets from this dashboard
- `/requester/request/:requestId/code` — Active collection-code display with countdown
- `/requester/history` — Personal history of past requests
- `/requester/settings` — Account (incl. photo), notifications

## Flow: Weekday key request

Three interactions from the dashboard to a code on screen.

1. On `/requester/dashboard`, tap an authorised key tile → opens the request sheet.
2. Confirm the intended return time (defaults to the end of the current day, 23:59) and tap "Request key".
3. Code displays on `/requester/request/:requestId/code` and is also emailed. A 10-minute countdown starts.

Exit conditions: the countdown reaching 0 auto-fires an expire call. Code verified at the desk → screen updates to "Key issued — return by [deadline]".

## Responsive breakpoints

- xs ≤ 480px (phone)
- sm 481–768px (large phone, small tablet)
- md 769–1024px (tablet, small laptop)
- lg 1025–1440px (standard desktop)
- xl > 1440px (wide desktop)

Generate the screen at xs (mobile) and lg (desktop) at minimum. Touch targets minimum 44×44px.

---

## Generation request

Generate the "Request a key" sheet that opens when a requester taps the Request button on an authorised key row.

**Sheet behaviour**: slides in from the right on desktop (480px wide), from the bottom on mobile (full-width, rounded top corners).

**Content**:

1. A read-only key-context card: code (monospace), room name, zone.
2. **Return by** field — a `datetime-local` input. Default value: today at 23:59, or tomorrow 23:59 if the current time has already passed today's default. Minimum selectable value is "now". Helper text: "Defaults to the end of the current day (11:59 PM)."
3. Primary "Request key" button, full-width, sticky at the bottom on mobile.
4. A sticky footer area for inline error text (e.g. on a 409 conflict — "You already have an active request for this key").

**State 2 — Submitting**: button shows a busy/disabled state, other inputs disabled.

**State 3 — Submitted**: the sheet does not collapse — it routes to `/requester/request/:requestId/code`, where the code is now live.

Use placeholder key NS-304, Senate Room 304, New Senate. Generate at 390px (mobile, primary) and 1440px (desktop) for each state.
