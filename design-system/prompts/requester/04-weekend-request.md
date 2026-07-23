# Requester Weekend Access Sheet

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **WeekendAccessSheet**, opened from the "Weekend access" button on `/requester/dashboard`. **Structural correction from the original prompt**: this is a Sheet triggered from the dashboard, not a standalone `/me/request/weekend` route. It also now includes an optional Dean-signature upload that didn't exist before.

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
- `/requester/request/:requestId/code` — Active collection-code display with countdown (also used for the weekend on-the-day code)
- `/requester/history` — Personal history of past requests
- `/requester/settings` — Account (incl. photo), notifications

## Flow: Weekend access request (registered requester)

1. On the requester dashboard, the Weekend requests panel has a "Weekend access" button that opens the WeekendAccessSheet.
2. Select an authorised key, a weekend date (Saturday/Sunday only), a reason for access, and — optionally — upload a photo of the Dean's signature on a physical authorisation (enables automatic pixel-level signature verification when the Dean decides).
3. The sheet shows a "Waiting for approval" confirmation; the requester is notified by email once the Dean decides.
4. On approval the request sits as APPROVED until the requested date. On the day, the requester mints a short-lived 6-digit collection code from the dashboard (same code page as the weekday flow).

A weekend request is a distinct object from a weekday key request, and the code is only minted on the requested date, never at approval time.

## Responsive breakpoints

- xs ≤ 480px (phone)
- sm 481–768px (large phone, small tablet)
- md 769–1024px (tablet, small laptop)
- lg 1025–1440px (standard desktop)
- xl > 1440px (wide desktop)

Generate the screen at xs (mobile) and lg (desktop) at minimum. Touch targets minimum 44×44px.

---

## Generation request

Generate the "Weekend access" sheet, opened via the button on the dashboard's Weekend requests widget — **not** a full standalone page. Slides in from the right on desktop (480px), from the bottom on mobile.

**Header**: "Request weekend access" + close (X).

**Form fields**:

1. **Key** (select) — populated from the requester's own authorised (non-retired) keys only.
2. **Weekend date** (native date input, min = today) — helper "Must be a Saturday or Sunday."
3. **Reason for access** (textarea, required) — "Tell the Dean what you need access for."
4. **Dean's signature (optional)** — a file upload (accepts JPEG/PNG, 5MB cap) with helper text: "Upload a close-up photo of the Dean's signature on your written authorisation. Enables automatic verification." This is genuinely optional — the sheet must submit fine without it, just without the automatic-verification benefit.

Primary "Submit request" button, full-width.

**State — Submitting**: button busy/disabled, inputs disabled.

**State — pending_hod (confirmation)**: the sheet content is replaced (not collapsed) by a confirmation: amber calendar icon, "Waiting for approval," body "You'll be notified by email when a decision is made." A summary card recaps the key code/room and the formatted weekend date. "Done" button closes the sheet back to the dashboard.

Use placeholder key NS-304, Senate Room 304, weekend date "Saturday 10 May 2026". Generate the empty form, the form with the optional signature photo attached, and the pending_hod confirmation. At 390px (mobile, primary) and 1440px (desktop).
