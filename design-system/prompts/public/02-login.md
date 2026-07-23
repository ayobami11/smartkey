# Login Page

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/login`** screen — a two-step credentials → OTP flow, not a single form.

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

## Flow: First-time login (any role)

1. User receives provisioning email from CSO with an activation link.
2. User clicks the link → `/activate`; sets a password. Passport-photo upload is required at this step for Requesters only — Verifiers do not upload a photo.
3. System sends a 6-digit email OTP; user enters it (segmented OTP input, 10-minute expiry, "Resend code" with a 60-second cooldown).
4. Privileged roles (CSO, Dean, Verifier) confirm MFA via email OTP on **every** login, not just the first.
5. Deans are routed to `/dean/onboarding` to upload their signature and stamp before any other action.
6. User lands on their role dashboard home.

## Responsive breakpoints

- xs ≤ 480px (phone)
- sm 481–768px (large phone, small tablet)
- md 769–1024px (tablet, small laptop)
- lg 1025–1440px (standard desktop)
- xl > 1440px (wide desktop)

Generate the screen at xs (mobile) and lg (desktop) at minimum. Touch targets minimum 44×44px.

---

## Generation request

Generate the SmartKey `/login` screen as a **two-step flow inside one card** — credentials, then OTP. Do not generate it as a single combined form.

**Layout**: centred login card on desktop (max 420px), full-width with 16px padding on mobile. Theme toggle (System/Light/Dark) top-right.

**Optional banner** (generate as a variant): a destructive-tinted banner above the card reading "This activation link has expired or is invalid. Please sign in or contact your CSO." — shown when the page is reached via a stale activation redirect.

**Step 1 — Credentials**: card heading "Sign in to your account." Fields: Email (with icon), Password (with icon and a show/hide eye toggle on the right). "Forgot password?" link below the password field, right-aligned. Primary "Sign in" button, full-width. Inline destructive error below the fields on failure, distinguishing two cases: "Email or password not recognised" (invalid credentials) vs "Can't reach the server right now — check your connection" (network failure) — these must read as different problems, not the same generic error.

**Step 2 — OTP** (replaces the card content in place, not a new page): banner showing the masked destination email ("Code sent to d\*\*\*@unilag.edu.ng"). A 6-digit segmented OTP input that auto-submits when pasted complete, and auto-focuses the submit button once manually filled. Helper text "Code expires in 10 minutes." Below: "Resend code" link (disabled with a visible countdown for 60 seconds after each send) and "Back to sign in" link.

**Below the card**: "Get help" link → `/help`, and "No account? Request weekend access" link → `/weekend-access`.

On successful OTP verification, the destination depends on role: `/cso/dashboard`, `/dean/dashboard`, `/verifier/dashboard`, or `/requester/dashboard`.

Generate: Step 1 default, Step 1 invalid-credentials error, Step 1 network-error state, Step 2 OTP entry, and the expired-link banner variant. Both 1440px (desktop) and 390px (mobile).
