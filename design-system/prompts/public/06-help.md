# Help / FAQ

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/help`** screen.

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

Generate the help page (`/help`). Static content page, accessible without authentication.

**Header**: SmartKey wordmark on the left, primary "Sign in" button on the right (same header pattern as the landing page, minus the "Help" link since we're already here).

**Layout**: centred max-width 800px on desktop, full-width with 16px padding on mobile.

**FAQ accordion** (multiple items can be open at once, not single-expand):

1. **How do I get an account?** — Explain accounts are provisioned by the CSO, who sends an activation email with a 24-hour link.
2. **I didn't receive my verification code.** — Check spam, wait a minute, use "Resend code" with its 60-second cooldown; contact the CSO if it still doesn't arrive.
3. **I forgot my password.** — Point to the "Forgot password?" link on the sign-in page.
4. **How do I request a key?** — Brief walkthrough: sign in, tap an authorised key on your dashboard, get a 6-digit code by email, present it at the desk within its 10-minute window.

**Contact support section** below the accordion: a card with "Still stuck?" heading and a mailto link to the CSO's email, styled as a tappable button.

**Footer**: same footer as the landing page.

Style as a calm, readable document — body-lg type, generous spacing, no decorative imagery. Generate at 1440px (desktop) and 390px (mobile).
