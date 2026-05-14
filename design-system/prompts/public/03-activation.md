# Account Activation

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/activate/:token`** screen.

---

## Project Context

SmartKey is a four-role web application replacing the paper-based key management workflow at the University of Lagos Senate Building. The roles are:

- **Chief Security Officer (CSO)**: senior administrator. Desktop-primary. Oversight, reports, audit log, user management.
- **Head of Department (HOD)**: faculty member. Mixed device usage. Authorises up to three collectors per departmental key, signs weekend approvals.
- **Verifier (security personnel)**: 24/7 desk staff in 8-hour shifts. Shared desktop at the security desk. Issues and receives keys, performs shift handover.
- **Requester (university staff)**: lowest-frequency user. Phone-primary. Requests a key, receives a 6-digit code by email, presents it at the desk.

Three AI components run in the background: rule-based risk scoring (visible to verifiers as Low/Medium/High tier), Gemini-generated shift reports (CSO dashboard), and pixel-level signature verification (HOD signed approvals). WCAG 2.2 AA conformance is the floor. Use the SmartKey design system from DESIGN.md — do not invent colours, typography, or component styling.

## Public area routes (no authentication)
- `/` — Landing page (explains SmartKey, links to login)
- `/login` — Email + password, "forgot password" link, MFA prompt on submit
- `/activate/:token` — Account activation: set password, accept terms, email OTP
- `/forgot-password` — Email-OTP-based password reset
- `/help` — Static FAQ and contact-the-CSO instructions

## Flow: First-time login (any role)
1. User receives provisioning email from CSO with activation link.
2. User clicks link → `/activate/:token`; sets password and accepts terms.
3. System sends 6-digit email OTP; user enters it.
4. Privileged roles (CSO, HOD, Verifier) confirm MFA preference (email OTP).
5. HODs are routed to `/hod/onboarding` to upload signature and stamp before any other action.
6. User lands on their role dashboard home.

---

## Generation request
Generate the account activation screen (`/activate/:token`). This is a multi-step screen the user reaches by clicking the activation link in their provisioning email.

**Layout**: centred card on desktop (max 480px), full-width on mobile. Stepper at the top of the card showing 3 steps: "Set password" → "Verify email" → "Done".

**Step 1 — Set password**:
- Heading: "Welcome to SmartKey, [Name]". Subhead: "Set a password to activate your account."
- Password field (12+ chars, mixed case, number, symbol — show requirements as a checklist below the field that ticks green as conditions are met)
- Confirm password field
- Terms checkbox: "I accept the SmartKey terms of use." (required)
- Primary "Continue" button

**Step 2 — Verify email**:
- Heading: "Check your email"
- Body copy: "We've sent a 6-digit code to [email]. Enter it below to finish activating your account."
- 6-digit OTP input (segmented, auto-advance, numeric keypad on mobile — use the same component pattern as the verifier's code input)
- "Resend code" link below (disabled for 30s after request, with countdown)
- Primary "Verify" button

**Step 3 — Done**:
- Success state: maroon-tinted check icon, heading "Account activated", body copy "You're ready to use SmartKey." Primary button "Continue to dashboard" (text varies by role: "Continue to dashboard" for CSO/Verifier/Requester, "Continue to onboarding" for HOD).

Also generate two error states: token expired (heading "This activation link has expired", explanation, "Contact CSO" button) and token invalid (heading "We couldn't find this activation link", same fallback).

Generate at 1440px (desktop) and 390px (mobile).
