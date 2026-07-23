# Landing Page

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/` (public landing page)** screen.

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

Generate the SmartKey landing page (`/`). This is a real, shipped marketing page — match this structure exactly, not a generic hero-only layout.

**Header** (sticky): SmartKey wordmark on the left; on the right, a "Help" ghost button (→ `/help`) and a primary "Sign in" button (→ `/login`).

**Hero section**: large display headline using the display-token from DESIGN.md — "Key management, finally accountable." (or a close institutional variant, dignified not marketing-loud). Subhead in body-lg explaining SmartKey replaces the paper logbook with a digital, AI-augmented system. Two CTAs side by side: primary "Sign in" → `/login`, secondary "Request weekend access" → `/weekend-access`.

**Stats bar**: a row of 4 stat blocks beneath the hero (large number + small label), e.g. "80–90% faster processing", "0 missing audit entries", "99.5% uptime target", "WCAG 2.2 AA". Stack 2×2 on mobile.

**Features grid**: three cards (stack on mobile): (1) **Real-time accountability** — "Every key movement logged, timestamped, and traceable." (2) **AI-assisted security** — "Risk scoring, generated reports, and signature verification protect every authorisation." (3) **Built for speed** — "Optimised for the desk under time pressure, with full keyboard and screen-reader support."

**"How it works" section**: 3 numbered steps — Submit (requester submits a request), Collect (present the code at the desk), Return (hand the key back, verified by code). Horizontal on desktop, stacked on mobile.

**Closing CTA band**: full-width maroon-primary band with "Sign in" and "Request weekend access" buttons repeated, centred.

**Footer**: SmartKey wordmark, nav links (Help, Sign in), copyright line "© 2026 University of Lagos."

Tone: institutional, calm, confident. Don't use the maroon decoratively — reserve it for primary CTAs, the header/footer accents, and the closing CTA band.

Generate at 1440px (desktop) and 390px (mobile).
