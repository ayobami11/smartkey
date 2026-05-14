# Login Page

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/login`** screen.

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
Generate the SmartKey `/login` screen.

**Layout**: co-branded UNILAG endorser at the top, centred login card on desktop (max 480px), full-width with 16px padding on mobile.

**Fields**:
- Institutional email (label above the field, never inside as placeholder)
- Password (with show/hide toggle on the right of the field)

**Actions**:
- Primary "Sign in" button, full-width inside the card
- "Forgot password?" link below the password field, right-aligned
- "Need help signing in?" link to `/help` in the footer below the card

**Behaviour**:
- On submit, route to an MFA email-OTP prompt screen before landing on the dashboard.
- Inline error below the field on invalid credentials, using the standard error microcopy: "Email or password not recognised. Try again or use the link below to reset."
- Loading state on the button during submission (skeleton text "Signing in…", button disabled).
- Theme toggle in the top-right (System / Light / Dark dropdown).

Generate three states: default, error (invalid credentials), loading. Both 1440px (desktop) and 390px (mobile).
