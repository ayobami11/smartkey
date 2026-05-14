# Requester Code Display

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/me/request/:requestId/code` — The 6-digit code (signature moment)** screen.

---

## Project Context

SmartKey is a four-role web application replacing the paper-based key management workflow at the University of Lagos Senate Building. The roles are:

- **Chief Security Officer (CSO)**: senior administrator. Desktop-primary. Oversight, reports, audit log, user management.
- **Head of Department (HOD)**: faculty member. Mixed device usage. Authorises up to three collectors per departmental key, signs weekend approvals.
- **Verifier (security personnel)**: 24/7 desk staff in 8-hour shifts. Shared desktop at the security desk. Issues and receives keys, performs shift handover.
- **Requester (university staff)**: lowest-frequency user. Phone-primary. Requests a key, receives a 6-digit code by email, presents it at the desk.

Three AI components run in the background: rule-based risk scoring (visible to verifiers as Low/Medium/High tier), Gemini-generated shift reports (CSO dashboard), and pixel-level signature verification (HOD signed approvals). WCAG 2.2 AA conformance is the floor. Use the SmartKey design system from DESIGN.md — do not invent colours, typography, or component styling.

## Requester area routes

- `/me` — Dashboard home: authorised keys grid, active request status
- `/me/request/:keyId` — Request a key (weekday or weekend variant)
- `/me/request/:requestId/code` — Active code display with countdown
- `/me/history` — Personal history of past requests
- `/me/profile` — Profile, theme, notifications

## Flow: Standard weekday key request (Requester)

Three interactions from `/me` to a code on screen.

1. On `/me`, tap an authorised key tile → opens the request sheet.
2. Confirm intended return time (defaults to end of business day, 17:00) and tap "Request key".
3. Code displays on `/me/request/:requestId/code` and is also emailed. 10-minute countdown starts.

Exit conditions: code expires → user can request a new code from the same screen. Code is verified at the desk → screen updates to "Key issued — return by 17:00".

## Notifications and realtime behaviour

- Persistent banners are for state that affects what the user can do (offline, onboarding incomplete, shift not handed over).
- Toasts are for transient confirmations only (3-second auto-dismiss). Never show critical information solely via toast.
- Realtime updates: small dot in app bar (green/amber/red) shows connection state.
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

Generate the active code display screen (`/me/request/:requestId/code`). This is the signature visual moment of the product — the entire screen is built around the 6-digit code.

**Layout**: centred max-width 480px on desktop, full-width with 16px page padding on mobile.

**Top of card**: small caption "Requested key", then key name "NS-304, Senate Room 304" in heading-md.

**Centre — the code**: render using the verification-code-display component from DESIGN.md (64px JetBrains Mono, generously letter-spaced, primary maroon colour). The code "482917". Below the code, the countdown timer in heading-lg JetBrains Mono "07:42" with a small label "minutes remaining".

**Below the code**: a "Copy code" button (secondary) and a small caption in body-sm muted-foreground "Also sent to your institutional email."

**Bottom of card**: small "Request a new code" link, **disabled** while the current code is active. Becomes enabled on expiry.

**Above everything**: the SmartKey app bar with theme toggle and user menu — but kept understated. The code is the only thing that should attract the eye.

**Generate the following states**:

1. **Active** — code visible "482917", 7:42 remaining, "Request new code" disabled.
2. **Almost expired** — same as active but countdown shows "0:48", with the timer turning warning-strong colour at 1:00 and below.
3. **Expired** — code is replaced by a card-sized message: heading "This code has expired." body "Request a new one to continue." Primary "Request new code" button (full-width). The original code is no longer visible.
4. **Issued (collected)** — code is replaced by a persistent confirmation: maroon-tinted check icon, heading "Key issued at 14:32." body "Return by 17:00 today." A return countdown in JetBrains Mono "2h 28m". Below: a small "View in history" link.

Generate all four states at 390px (mobile, primary) and 1440px (desktop).
