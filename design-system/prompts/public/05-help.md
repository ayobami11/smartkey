# Help / FAQ

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/help`** screen.

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
Generate the help page (`/help`). Static content page, accessible without authentication.

**Layout**: centred max-width 800px on desktop, full-width with 16px padding on mobile. UNILAG endorser at the top, footer at the bottom.

**Sections (each as an accordion expanded by default)**:
1. **What is SmartKey?** — One paragraph explaining the system.
2. **I can't sign in.** — Common causes: account not yet activated, wrong password, MFA code expired. Include "Reset password" link and "Contact CSO" link.
3. **I haven't received my activation email.** — Steps: check spam, contact CSO if still missing. Include CSO contact button.
4. **My code expired before I got to the desk.** — Explain the 10-minute window and how to request a new code.
5. **A key shows as overdue but I returned it.** — Steps: contact the verifier on duty; CSO will reconcile during shift handover.
6. **Who do I contact?** — Three rows: CSO (operational issues, account problems), HOD (key authorisations for your department), IT support (system errors with reference IDs).

**Footer of the card**: "Still stuck? Email [CSO email]. Include your error reference if you have one." with the email as a tappable mailto link.

Style as a calm, readable document — body-lg type, generous spacing, no decorative imagery. Generate at 1440px (desktop) and 390px (mobile).
