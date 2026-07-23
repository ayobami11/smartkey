# Requester Code Display

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/requester/request/:requestId/code`** screen — the signature visual moment of the product. It has more states than the original prompt described (it also handles the weekend on-the-day code and a rolled-back-to-APPROVED state).

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
- `/requester/request/:requestId/code` — Active collection-code display with countdown (also used for the weekend on-the-day code)
- `/requester/history` — Personal history of past requests
- `/requester/settings` — Account (incl. photo), notifications

## Flow: Weekday key request

3. Code displays on `/requester/request/:requestId/code` and is also emailed. A 10-minute countdown starts. Exit conditions: the countdown reaching 0 auto-fires an expire call and the code is replaced by a "Request a new code" prompt on the same screen. Code verified at the desk → screen updates to "Key issued — return by [deadline]".

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

Generate the active code display screen (`/requester/request/:requestId/code`), across its **full state machine** — this page is reused for both the weekday flow and the weekend on-the-day code, and has more states than "active / expired / issued."

**Layout**: centred max-width 480px on desktop, full-width with 16px page padding on mobile. A loading skeleton mirrors the final layout's block shapes exactly (no layout shift).

**State — Not found**: X-circle icon, "Request not found," "Back to dashboard" link. (Reached if the request doesn't exist or isn't the signed-in user's own.)

**State — KEY_ISSUED**: key icon (emerald), "Key issued," code/room, "Return by [deadline]," back link.

**State — APPROVED (weekend code expired, rolled back)**: this happens when a weekend request's on-the-day code lapsed and the request fell back to APPROVED. Shows code/room, "Code expired," body "Your 10-minute code has expired. Generate a new one when you are ready to collect." A "Generate new code" button, plus a ghost "Back to dashboard" link.

**State — Non-active / terminal** (covers CANCELLED, DECLINED, PENDING_HOD, EXPIRED, or a CODE_ISSUED request whose countdown independently hit 0 before the page caught up): X-circle icon with a status-specific message, and a back link.

**State — CODE_ISSUED (active, the primary "signature moment" state)**: key zone/room/code header above a card labelled "Your collection code," a live countdown (mm:ss + a linear progress bar, 10-minute lifetime), the giant 6-digit code rendered at the design system's code-display size (64px JetBrains Mono, generous letter-spacing), an instruction line, and an emerald "Request approved" badge. Ghost "Back to dashboard" link. The countdown reaching 0 auto-fires an expire call in the background.

Generate all five states at 390px (mobile, primary) and 1440px (desktop). Use code "482917" and key NS-304, Senate Room 304 as placeholder data.
