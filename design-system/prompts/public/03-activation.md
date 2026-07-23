# Account Activation

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/activate`** screen — session-gated (reached only via a valid invite-link session), with photo upload required for Requesters only.

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

Generate the account activation screen (`/activate`). The user reaches this only via a valid invite-link session (the app checks the session before showing the form and redirects to `/login?error=invalid-link` if it's missing or to `/login` if the role isn't Verifier or Requester — Deans and the CSO are provisioned differently and never land here).

**Layout**: centred card on desktop (max 480px), full-width on mobile.

**State 1 — Checking** (brief, on load): centred text "Setting up your account..." — no form visible yet.

**State 2 — Form**: heading "Activate your account." Subtitle differs by role: Requesters see a line mentioning the photo requirement ("You'll also need a passport photo for identification at the desk."); Verifiers see a shorter subtitle without any photo mention.

Fields:

- Password (show/hide toggle) with a complexity helper below ("At least 8 characters, mixed case, a number, and a symbol")
- Confirm password (show/hide toggle)
- **Requester-only**: a passport photo upload — a drag/click dropzone (cloud-upload icon, "Click to browse," "PNG or JPG, max 5MB") that swaps to an aspect-3:4 image preview with a "Replace" button once a valid file is selected. This field is validated client-side and is **required for Requesters only** — do not show it at all for the Verifier variant.

Primary "Activate account" button, full-width, disabled until required fields (and, for Requesters, the photo) are valid.

**State 3 — Done**: emerald success card, check icon, heading "Account activated," body "You're ready to use SmartKey." Primary "Go to sign in" button → `/login`.

Generate three variants: the Requester form (with photo upload), the Verifier form (without photo upload), and the Done state. At 1440px (desktop) and 390px (mobile).
