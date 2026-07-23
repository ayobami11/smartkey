# Dean Weekend Request Review

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/dean/weekend-requests` — Pending weekend access requests** screen, covering both registered-requester and guest/external requests.

---

## Project Context

SmartKey is a four-role web application replacing the paper-based key management workflow at the University of Lagos Senate Building. The roles are:

- **Chief Security Officer (CSO)**: senior administrator. Desktop-primary. Oversight, reports, audit log, user management.
- **Dean** (system role `DEAN`): faculty member. Mixed device usage. Authorises up to three collectors per unit key, signs weekend approvals. The Administration unit's keys are authorised by the CSO instead — no Dean exists for it.
- **Verifier (security personnel)**: 24/7 desk staff in 8-hour shifts. Shared desktop at the security desk. Issues and receives keys, performs shift handover.
- **Requester (university staff)**: lowest-frequency user. Phone-primary. Requests a key, receives a 6-digit code by email, presents it at the desk.

Three AI components run in the background: rule-based risk scoring (visible to verifiers as Low/Medium/High tier), Gemini-generated shift reports (CSO dashboard), and pixel-level signature verification (Dean-signed approvals). WCAG 2.2 AA conformance is the floor. Use the SmartKey design system from DESIGN.md — do not invent colours, typography, or component styling.

Grouping term: SmartKey organises keys by **Unit** (not "Department" or "Faculty").

## Dean area routes

- `/dean/dashboard` — Dashboard home: pending weekend requests, recent key activity, collectors table (no key grid here — that moved to its own route)
- `/dean/keys` — Unit key inventory grid
- `/dean/keys/:keyId` — Manage authorised collectors (max 3) for one key
- `/dean/weekend-requests` — Review and decide weekend access requests (registered and guest)
- `/dean/onboarding` — One-time signature and stamp upload, forced on first login
- `/dean/settings` — Account, signature & stamp replacement, notifications

## Flow: Weekend access request review (Dean)

1. On `/dean/dashboard`, the weekend-requests panel shows pending items with a badge count.
2. Tap a request → detail sheet shows requester/guest, key, date, description.
3. Choose Approve or Decline (with an optional note). For a registered requester with an uploaded signature, approval runs signature verification first — a mismatch holds the approval for CSO review instead of applying it.

## Flow: Guest/external weekend access request

1. An external person with no SmartKey account visits `/weekend-access` (linked from the login and landing pages).
2. They submit their details, a declared ID document (checked physically at the desk — guests have no photo on file), the unit they need access within, requested room, weekend date, and an uploaded Dean/CSO authorisation letter.
3. On submit, the guest reaches a session-less status page via an unguessable access token.
4. The Dean reviews the uploaded letter, **assigns a specific key** from their unit, and approves or declines — no signature verification runs for guests, since there's no reference signature to compare against; the letter is reviewed manually.
5. On the requested date, the guest mints their own 6-digit collection code, then a return code after collecting the key.

## AI surface: Signature verification

- **On match**: no UI surface; a subtle audit-log entry "Signature verified".
- **On mismatch**: the approval is **held**, not declined and not applied. The screen shows an amber "Approval held — signature mismatch" state: "The CSO has been notified and will review. You will be able to proceed once they resolve it."
- Guest requests never run signature verification.

## Responsive breakpoints

- xs ≤ 480px (phone)
- sm 481–768px (large phone, small tablet)
- md 769–1024px (tablet, small laptop)
- lg 1025–1440px (standard desktop)
- xl > 1440px (wide desktop)

Generate the screen at xs (mobile) and lg (desktop) at minimum. Touch targets minimum 44×44px.

---

## Generation request

Generate the Dean weekend request review screen (`/dean/weekend-requests`). List + detail sheet, covering both request kinds.

**List**: pending weekend requests, colour-striped by risk/expired state (grey for expired-undecided with an ExpiredBadge, red/amber/emerald matching the RiskTierBadge otherwise), a GuestBadge on external requests. Each row: key code or "Key on approval" for an unassigned guest request, RiskTierBadge, relative submission time, requester name, requested date, "Review" button (disabled + tooltip when offline). Empty: inbox icon, "No pending requests."

**Detail sheet** (right side on desktop, full-screen on mobile):

1. **Identity block**: avatar with initials, requester name, unit — for a guest, also show the declared ID document type/number, phone, and a button labelled **"View authorisation letter"**. For a registered requester who uploaded a signature photo, the same button slot instead reads **"View Dean signature"** and opens the submitted image (context-aware label — do not use the same label for both cases).
2. **Request details block**: key code + room (or, for a guest, "Not yet assigned" plus a **key-assignment select** populated from the Dean's own unit's keys — this only appears for guest requests, since registered requesters already picked their key), the requested date with an ExpiredBadge if passed, and the reason/work-activity description in full.
3. **High-risk warning banner** (amber), shown only when risk tier is High.
4. Optional note textarea, then **Approve** / **Decline** buttons (disabled while offline or if expired).

**Decision outcomes** (generate all three): **Approved** — check icon, "Approved. [Requester] has been notified by email."; **Declined** — X icon, "Declined. [Requester] has been notified."; **Held** — amber alert-triangle icon, "Approval held — signature mismatch. The CSO has been notified and will review. You will be able to proceed once they resolve it." (this state can only occur for a registered requester with a submitted signature, never for a guest).

Use placeholder data: 3 pending requests — one registered requester whose approval will trigger the Held outcome, one guest with an unassigned key needing the assignment select, one Low-risk registered requester for the plain Approve path. Generate at 1440px (desktop) and 390px (mobile).
