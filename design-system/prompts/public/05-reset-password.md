# Reset Password

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/reset-password`** screen — reached only via the link emailed from `/forgot-password`. This file did not exist in the original prompt set; forgot-password and reset-password were previously conflated into one screen, but they are two distinct routes with distinct states in the shipped app.

---

## Project Context

SmartKey is a four-role web application replacing the paper-based key management workflow at the University of Lagos Senate Building. The roles are:

- **Chief Security Officer (CSO)**: senior administrator. Desktop-primary. Oversight, reports, audit log, user management.
- **Dean** (system role `DEAN`): faculty member. Mixed device usage. Authorises up to three collectors per unit key, signs weekend approvals. The Administration unit's keys are authorised by the CSO instead — no Dean exists for it.
- **Verifier (security personnel)**: 24/7 desk staff in 8-hour shifts. Shared desktop at the security desk. Issues and receives keys, performs shift handover.
- **Requester (university staff)**: lowest-frequency user. Phone-primary. Requests a key, receives a 6-digit code by email, presents it at the desk.

Three AI components run in the background: rule-based risk scoring (visible to verifiers as Low/Medium/High tier), Gemini-generated shift reports (CSO dashboard), and pixel-level signature verification (Dean-signed approvals). WCAG 2.2 AA conformance is the floor. Use the SmartKey design system from DESIGN.md — do not invent colours, typography, or component styling.

Grouping term: SmartKey organises keys by **Unit** (not "Department" or "Faculty").

## Public area routes (no authentication)

- `/` — Landing page (explains SmartKey, links to login and to weekend access)
- `/login` — Email + password, then a 6-digit email-OTP step (MFA)
- `/activate` — Account activation from an invite link: set password; passport-photo upload required for Requesters only
- `/forgot-password` — Request a password-reset email
- `/reset-password` — Set a new password (reached via the emailed link); has its own expired-link state
- `/help` — Static FAQ and contact-the-CSO instructions
- `/weekend-access` — External (non-registered) weekend key request form — no account needed
- `/weekend-access/:token` — Session-less guest status/code page, reached via an unguessable link emailed at submission

## Responsive breakpoints

- xs ≤ 480px (phone)
- sm 481–768px (large phone, small tablet)
- md 769–1024px (tablet, small laptop)
- lg 1025–1440px (standard desktop)
- xl > 1440px (wide desktop)

Generate the screen at xs (mobile) and lg (desktop) at minimum. Touch targets minimum 44×44px.

---

## Generation request

Generate the reset-password screen (`/reset-password`), reached by clicking the link in the "forgot password" email.

**Layout**: same card treatment as login/forgot-password.

**State 1 — Expired link** (the page reads an `?error=expired` query param): warning-tinted card, alert-circle icon, heading "Link expired," body "This password reset link is no longer valid." Primary "Request a new link" button → `/forgot-password`.

**State 2 — Form** (default, valid link): heading "Set a new password." Fields: New password (show/hide toggle, complexity helper), Confirm password (show/hide toggle). Primary "Reset password" button, full-width.

**State 3 — Done**: success icon, heading "Password updated," body "You can now sign in with your new password." Primary "Sign in" button → `/login`.

Generate all three states at 1440px (desktop) and 390px (mobile).
