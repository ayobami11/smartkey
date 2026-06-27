# Requester Request-Key Sheet

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/me/request/:keyId` — Request a key (sheet)** screen.

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

## Responsive breakpoints

- xs ≤ 480px (phone)
- sm 481–768px (large phone, small tablet)
- md 769–1024px (tablet, small laptop)
- lg 1025–1440px (standard desktop)
- xl > 1440px (wide desktop)

Generate the screen at xs (mobile) and lg (desktop) at minimum. Touch targets minimum 44×44px.

---

## Generation request

Generate the "Request a key" sheet that opens when a requester taps a key tile on `/me`.

**Sheet behaviour**: slides in from the right on desktop (480px wide), bottom on mobile (full-width with rounded top corners).

**Content** (top to bottom):

1. Header: "Request a key" + close (X). Selected key shown immediately below as a read-only summary card: key code (code-md monospace), room name, zone, and a small "Change key" link that closes this sheet and re-opens the dashboard.
2. **Intended return time** picker. Default value: "Today, 17:00". Time-only picker on a single calendar day (the same day as the request); cannot select past times. Helper text below: "Keys must be returned by end of business day (17:00)."
3. **Notes** (optional textarea, max 200 chars): "Tell the verifier anything they should know (optional)."
4. Primary "Request key" button (full-width, sticky bottom).
5. Secondary "Cancel" link.

**State 2 — Validation error** (return time set in past):
Inline error below the picker using standard error microcopy: "Return time must be later than now."
Primary button is disabled.

**State 3 — Submitting**:
Button shows skeleton "Submitting..." and is disabled. Other inputs disabled.

**State 4 — Submitted**:
Sheet animates to a confirmation state (do not collapse). Maroon-tinted check icon, heading "Request submitted", body "Check your email for the 6-digit code." Primary "View code" button → `/me/request/:requestId/code`. Secondary "Done" link → back to `/me`.

Use placeholder key NS-304, Senate Room 304, New Senate. Generate at 390px (mobile, primary) and 1440px (desktop) for each state.
