# Guest Weekend Access Request

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/weekend-access`** screen. **This screen did not exist in the original prompt set** — it is the entry point for the guest/external weekend-access flow, a significant piece of the product with zero prior design coverage.

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

## Flow: Guest/external weekend access request

1. An external person with no SmartKey account visits `/weekend-access` (linked from the login page and the landing page).
2. They submit: full name, email, phone (optional), a declared ID document (type + number — checked physically at the desk, since guests have no passport photo on file), the unit they need access within, a free-text description of the room/area needed, a weekend date, and an uploaded Dean/CSO authorisation letter (PDF or image).
3. On submit, the guest reaches a session-less status page at `/weekend-access/:token` (keyed by an unguessable access token) and receives the same link by email as a fallback.
4. The relevant Dean (or the CSO, for a request routed to Administration) reviews the uploaded letter, assigns a specific key from their unit, and approves or declines. No signature verification runs for guests — there is no reference signature to compare against, so the letter is reviewed manually.
5. On the requested date, the guest mints their own 6-digit collection code from the status page, then later a 6-digit return code after collecting the key (same generate-code pattern, both 15/10-minute windows). The verifier checks the physical ID document at the desk, not a photo.

## Responsive breakpoints

- xs ≤ 480px (phone)
- sm 481–768px (large phone, small tablet)
- md 769–1024px (tablet, small laptop)
- lg 1025–1440px (standard desktop)
- xl > 1440px (wide desktop)

Generate the screen at xs (mobile) and lg (desktop) at minimum. Touch targets minimum 44×44px.

---

## Generation request

Generate the guest weekend-access request form (`/weekend-access`). No sign-in required — this is a fully public, anonymous form.

**Layout**: centred max-width 640px card on desktop, full-width with 16px padding on mobile.

**Heading**: "Request weekend key access." Subhead: "No SmartKey account needed. Upload your Dean's authorisation letter — once approved, you'll get a 6-digit code to collect the key on the day."

**Form fields, in order**:

1. **Full name** (required)
2. **Email** (required) — helper text "Your status link and code are sent here."
3. **Phone** (optional)
4. **ID document type** (select: e.g. National ID, Staff ID, Driver's Licence, Passport) — helper text "Bring this document to the desk so the officer can verify your identity." This is the guest's equivalent of a passport photo — an ID declaration instead of an uploaded image.
5. **ID document number** (required)
6. **Requested room** (free text, required) — placeholder "e.g. Lab 102, Server Room"
7. **Unit** (select, required) — populated from the list of units; show a destructive inline error if the list fails to load, with the select disabled.
8. **Weekend date** (native date input, min = today, required) — helper "Choose the Saturday or Sunday you need access."
9. **Authorisation letter** (required upload) — a dropzone (cloud-upload icon, "Click to upload the signed letter," accepts PDF/PNG/JPG with a size-limit caption) that swaps to a filled state (document icon, filename, "Replace" button) once a file is chosen.

Primary "Submit request" button, full-width, disabled until required fields are valid.

**Success state** (replaces the form in place, does not navigate away): emerald check-circle icon, heading "Request submitted." Body explaining a status-tracking link was emailed. Below: the **status URL itself** shown in a copyable monospace box with a "Copy" button (icon swaps to a check on copied) — an email-delivery-delay fallback so the guest isn't stuck if the email is slow. A "View request status" button opens the link in a new tab.

**Below the form/success card**: "Already have a SmartKey account? Sign in" link → `/login`.

Generate: the empty form, the filled form with the letter attached, and the success state. At 1440px (desktop) and 390px (mobile).
