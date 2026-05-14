# Landing Page

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/` (public landing page)** screen.

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

## Responsive breakpoints
- xs ≤ 480px (phone)
- sm 481–768px (large phone, small tablet)
- md 769–1024px (tablet, small laptop)
- lg 1025–1440px (standard desktop)
- xl > 1440px (wide desktop)

Generate the screen at xs (mobile) and lg (desktop) at minimum. Touch targets minimum 44×44px.

---

## Generation request
Generate the SmartKey landing page (`/`).

**Layout**: hero section, three-section value proposition, footer. Single column on mobile; centred max-width 1280px on desktop.

**Hero**: large display headline using the headline-display token from DESIGN.md ("Key management, finally accountable" or similar institutional headline — keep it dignified, not marketing-loud). Subhead in body-lg explaining SmartKey replaces the paper logbook with a digital, AI-augmented system. Two CTAs: primary "Sign in" → `/login`, secondary "Get help" → `/help`. Co-branded UNILAG endorser at the top.

**Value proposition section**: three columns (stack on mobile) covering: (1) Real-time accountability — "Every key movement logged, timestamped, and traceable." (2) AI-assisted security — "Risk scoring, generated reports, and signature verification protect every authorisation." (3) Built for the desk — "Optimised for speed under pressure, with full keyboard and screen-reader support."

**Footer**: SmartKey wordmark, UNILAG endorser, contact link, copyright "© 2026 University of Lagos. SmartKey is a research project of the Department of Electrical and Electronics Engineering."

Tone: institutional, calm, confident. Don't use the maroon decoratively — reserve it for the primary CTA and the hero accent. Keep the page quiet; this is a research project, not a marketing site.

Generate at 1440px (desktop) and 390px (mobile).
