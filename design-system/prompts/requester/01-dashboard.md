# Requester Dashboard Home

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/requester/dashboard` — Requester dashboard home (mobile-first)** screen, composed of four widgets.

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

- `/requester/dashboard` — Dashboard home: active collection-code banner, outstanding keys (with a return-code sheet), authorised keys grid, weekend requests panel. Weekday and weekend requests both open as Sheets from this dashboard — there is no separate /requester/request/:keyId or /requester/request/weekend route
- `/requester/request/:requestId/code` — Active collection-code display with countdown (also used for the weekend on-the-day code)
- `/requester/history` — Personal history of past requests
- `/requester/settings` — Account (incl. photo), notifications

## Flow: Weekday key request

Three interactions from the dashboard to a code on screen.

1. On `/requester/dashboard`, tap an authorised key tile → opens the request sheet.
2. Confirm the intended return time (defaults to the end of the current day, 23:59) and tap "Request key".
3. Code displays on `/requester/request/:requestId/code` and is also emailed. A 10-minute countdown starts.

Exit conditions: the countdown reaching 0 auto-fires an expire call and the code is replaced by a "Request a new code" prompt on the same screen. Code verified at the desk → screen updates to "Key issued — return by [deadline]".

## Flow: Weekend access request (registered requester)

1. On the requester dashboard, the Weekend requests panel has a "Weekend access" button that opens the WeekendAccessSheet.
2. Select an authorised key, a weekend date (Saturday/Sunday only), a reason for access, and — optionally — upload a photo of the Dean's signature on a physical authorisation.
3. The sheet shows a "Waiting for approval" confirmation; the requester is notified by email once the Dean decides.
4. On approval the request sits as APPROVED until the requested date. On the day, the requester mints a short-lived 6-digit collection code from the dashboard.

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

Generate the requester dashboard home (`/requester/dashboard`) as **four stacked widgets**, in this order — not a single generic "grid + banner" layout.

**Widget 1 — Active request banner**: renders **only** if the requester has a live `CODE_ISSUED` collection code. Shows "Your collection code" label, key code/room subtitle, a live mm:ss countdown, the giant 6-digit code in JetBrains Mono, an instruction line ("Show this to the security officer at the desk"), and a "Cancel request" button. **Expired sub-state**: the card turns muted, the label flips to "Code expired," the code/countdown/cancel button disappear, replaced by "This code has expired. Request a new one to continue." If there's no active code at all, this widget is entirely absent — do not render an empty placeholder card.

**Widget 2 — Outstanding keys**: loading/error/empty("No keys are currently issued") states. Each row: a stripe (emerald normal / destructive overdue), code, an "Overdue" pill where relevant, room, "Issued [relative time]", "Return by [deadline]", and a "Return" button that opens the return-code sheet (see `05-return-code.md` for its full state machine — summarise it here as: "Generate code" → a countdown + progress-bar code display the requester reads aloud to the verifier).

**Widget 3 — Authorised keys**: heading "Authorised keys." Loading/error("Failed to load your keys")/empty("No keys authorised. Reach out to your faculty's Dean.") states. Each row: a zone-coloured stripe (primary for New Senate, blue for Old Senate), code, a "Retired" pill if applicable, room, zone label, and a "Request" button (disabled if retired or offline). A dismissible amber conflict banner can appear outside the request sheet after a 409 conflict (e.g. "You already have an active request for this key").

**Widget 4 — Weekend requests**: header row with "Weekend requests" title and a "Weekend access" button (opens the WeekendAccessSheet). Loading/empty("No weekend requests. Weekend access requests you submit will appear here.") states. Each row: a status badge — amber clock "Awaiting approval" (PENDING_HOD), emerald check "Approved" (APPROVED), destructive X "Declined" (DECLINED) — plus code, room, requested date. An APPROVED row dated today additionally shows a "Get code" button; a future-dated approval just shows the date passively.

Use placeholder data: Requester "Dr. Bakare", greeting "Good afternoon". Active code "482917" with "7:42 remaining" for NS-304. Outstanding keys (1 item, normal). Authorised keys (4 items: NS-304, NS-305, OS-12, OS-13). Weekend requests (2 items: one Awaiting approval, one Approved for today with the Get code button visible).

Generate four variants: **mobile (default)** at 390px, **desktop** at 1440px, **empty state** (no authorised keys, no active banner, showing the exact empty copy above), and **no active request** (banner widget entirely absent). Mobile is the primary reference.
