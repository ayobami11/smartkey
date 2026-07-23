# Guest Weekend Access Status

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/weekend-access/:token`** screen. **This screen did not exist in the original prompt set.** It is the largest state machine in the whole app — generate every state listed below, not just the happy path.

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
2. They submit: full name, email, phone (optional), a declared ID document (type + number), unit, requested room, weekend date, and an uploaded authorisation letter.
3. On submit, the guest reaches this session-less status page via an unguessable access token, and receives the same link by email.
4. The relevant Dean (or CSO, for Administration) reviews the letter, assigns a specific key, and approves or declines.
5. On the requested date, the guest mints their own 6-digit collection code here, then later a 6-digit return code after collecting the key. There is no realtime subscription for anonymous users — this page polls and also refetches on window focus, so a manual "Refresh status" action matters.

## Responsive breakpoints

- xs ≤ 480px (phone)
- sm 481–768px (large phone, small tablet)
- md 769–1024px (tablet, small laptop)
- lg 1025–1440px (standard desktop)
- xl > 1440px (wide desktop)

Generate the screen at xs (mobile) and lg (desktop) at minimum. Touch targets minimum 44×44px.

## State coverage required

This screen has more distinct states than any other in the app. Generate every one listed below — do not collapse them into a single "generic status card."

---

## Generation request

Generate the guest status page (`/weekend-access/:token`), no authentication — the token in the URL is the guest's only credential. Every state below is wrapped in the same shell: centred max-width 480px card, with a "Refresh status" ghost button available on every non-loading, non-terminal state (there's no realtime for anonymous users, so refresh is a real, needed action, not decoration).

**Loading**: 3 skeleton blocks matching the shape of the content states below.

**Not found** (invalid/unknown token): neutral card, X-circle icon, heading "Request not found," a "New request" button → `/weekend-access`.

**Fetch error**: destructive-tinted card, alert-circle icon, "Something went wrong," "Try again" button (re-fetches).

**PENDING_HOD**: warning-tinted card, clock icon, heading "Awaiting approval," a greeting personalised with the guest's first name, and a meta line showing the requested date (formatted) and the requested room.

**DECLINED**: destructive-tinted card, X-circle icon, heading "Request declined."

**CANCELLED / EXPIRED**: neutral card, heading matching the status; EXPIRED additionally shows a "New request" link back to `/weekend-access`.

**KEY_RETURNED** (terminal, the flow completed successfully): success-tinted card, check icon, heading "Key returned. Thank you."

**APPROVED**: success-tinted card, check-circle icon, a key chip showing the assigned key code and room name. If the requested date is **today**: a primary "Generate collection code" button. If the date is still in the future: no button, just the meta line showing the future date.

**CODE_ISSUED**: key room/code header, then the code card — reuse the same CodeCountdown pattern as the registered requester's code page (giant mono 6-digit code + mm:ss countdown), a "Copy code" button (clipboard icon that swaps to a check on copy). If the countdown reaches 0, show an "isExpired" sub-state: "Code expired… updating your session" while the page auto-calls the expire endpoint.

**KEY_ISSUED** (the guest return flow — inline on this page, not a separate sheet): an emerald "Key issued" context card (code, room, "Return by [deadline]"), then one of three sub-states: (a) no return code yet → "Generate return code" button; (b) active return code → the same countdown + giant-mono-code card pattern, captioned "Read this to the security officer when you hand back the key"; (c) return code expired → "Generate new return code" button.

Generate at minimum: PENDING_HOD, APPROVED (future date), APPROVED (today, pre-code), CODE_ISSUED, KEY_ISSUED (pre-return-code), KEY_ISSUED (active return code), DECLINED, and Not found. At 1440px (desktop) and 390px (mobile) — mobile is primary, since a guest is almost certainly on their phone at the desk.
