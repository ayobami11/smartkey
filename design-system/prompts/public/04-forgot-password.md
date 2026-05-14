# Forgot Password

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/forgot-password`** screen.

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

---

## Generation request
Generate the forgot-password flow (`/forgot-password`). Three steps in a single card layout.

**Step 1 — Request**:
- Heading "Reset your password". Body copy: "Enter your institutional email. We'll send you a 6-digit code to reset your password."
- Institutional email field
- Primary "Send code" button
- Secondary "Back to sign in" link

**Step 2 — Verify**:
- Heading "Check your email". Body: "Enter the 6-digit code we sent to [email]."
- 6-digit OTP input (segmented, same pattern as activation)
- "Resend code" link with 30s cooldown
- Primary "Verify" button

**Step 3 — New password**:
- Heading "Set a new password"
- New password field (with the same requirements checklist as activation)
- Confirm password field
- Primary "Reset password" button

**Done state**: success card with "Password reset" heading, "Sign in" primary button → `/login`.

Same layout, max-width, and theme-toggle treatment as the login screen. Generate at 1440px (desktop) and 390px (mobile).
