# Verifier Dashboard Home

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/verifier/dashboard` — Verifier dashboard home (highest stakes)** screen. **Layout correction from the original prompt set**: the two panels are stacked vertically (queue, then outstanding keys), not a 60/40 two-column split.

---

## Project Context

SmartKey is a four-role web application replacing the paper-based key management workflow at the University of Lagos Senate Building. The roles are:

- **Chief Security Officer (CSO)**: senior administrator. Desktop-primary. Oversight, reports, audit log, user management.
- **Dean** (system role `DEAN`): faculty member. Mixed device usage. Authorises up to three collectors per unit key, signs weekend approvals. The Administration unit's keys are authorised by the CSO instead — no Dean exists for it.
- **Verifier (security personnel)**: 24/7 desk staff in 8-hour shifts. Shared desktop at the security desk. Issues and receives keys, performs shift handover.
- **Requester (university staff)**: lowest-frequency user. Phone-primary. Requests a key, receives a 6-digit code by email, presents it at the desk.

Three AI components run in the background: rule-based risk scoring (visible to verifiers as Low/Medium/High tier), Gemini-generated shift reports (CSO dashboard), and pixel-level signature verification (Dean-signed approvals). WCAG 2.2 AA conformance is the floor. Use the SmartKey design system from DESIGN.md — do not invent colours, typography, or component styling.

Grouping term: SmartKey organises keys by **Unit** (not "Department" or "Faculty").

## Verifier area routes

- `/verifier/dashboard` — Live request queue and outstanding keys, with the issue-key and return-key flows opening as side sheets from this one screen
- `/verifier/handover` — Shift handover acknowledgement, locked at the start of every shift; also covers the "no prior shift / start a shift" state
- `/verifier/incidents` — Log a new incident; review own shift's incidents

## Flow: Issue a key (highest-frequency flow)

1. Verifier enters the 6-digit code presented by the collector — either via the persistent code-entry shortcut or by tapping a queue row.
2. Screen reveals: requester name and photo (or, for a guest request, the declared ID document type/number instead — no photo exists for guests), the requested key, and a RiskTierBadge with expandable factors.
3. Verifier confirms identity match → taps "Issue key". Persistent confirmation with timestamp; for a guest issue, the confirmation additionally reminds the verifier to check the physical ID document.

If risk is High: an explicit RiskAcknowledgement checkbox is inserted before the Issue button enables.

## Flow: Receive a returned key

1. From the outstanding-keys list, tap the relevant row → opens the return sheet.
2. Default path: ask the requester for their 6-digit return code (self-generated, 15-minute expiry) and enter it → "Confirm return".
3. Fallback path: "Requester can't provide a code?" switches to an override form — a required reason textarea replaces the code input. This records an **unverified** return and raises a `SUSPICIOUS_ACTIVITY` incident to the CSO automatically.
4. Confirmation persists; row removed from outstanding. The unverified path additionally discloses "Returned without a requester code — CSO alerted."

## Flow: Shift handover

The dashboard is locked behind the handover screen at the start of every new shift. If there's no prior shift, a "Start shift" state shows instead — a read-only outstanding-keys list and a single "Start shift" button, no acknowledgement required. Otherwise: outgoing officer's summary at top, outstanding keys below as a tri-state checklist. Acknowledgement is logged with the incoming officer's identity and timestamp.

## AI surface: Risk scoring engine

- **Treatment**: RiskTierBadge — a pill with status colour + shield icon + tier label ("Low risk" / "Medium risk" / "High risk"). Non-trivial size, not a small decoration.
- **Factor reveal**: a "View factors" text-link beneath the badge opens a popover (RiskFactorPopover) listing each contributing rule in plain English with its numeric weight.
- **High-risk gating**: an explicit RiskAcknowledgement checkbox is inserted before the verifier can proceed.

## Notifications and realtime behaviour

- Persistent banners are for state that affects what the user can do (offline, onboarding incomplete, shift not handed over).
- Toasts are for transient confirmations only (3-second auto-dismiss). Never show critical information solely via toast.
- Realtime updates: small dot in app bar (green connected / amber reconnecting / red offline) shows connection state.
- Notification centre: top-right bell icon with badge count.

## State coverage required

For every async surface in this screen, design four states: empty, loading (skeleton placeholders, no layout shift), error (inline near the offending field, plus page-level fallback with correlation ID), and content.

If the screen depends on realtime data, also design the offline state: persistent OfflineBanner at top, destructive actions disabled with tooltip "Available again when you reconnect."

## Responsive breakpoints

- xs ≤ 480px (phone)
- sm 481–768px (large phone, small tablet)
- md 769–1024px (tablet, small laptop)
- lg 1025–1440px (standard desktop)
- xl > 1440px (wide desktop)

Generate the screen at xs (mobile) and lg (desktop) at minimum. Touch targets minimum 44×44px.

---

## Generation request

Generate the verifier dashboard home (`/verifier/dashboard`). **Two sections stacked vertically** — "Pending requests" (the live queue) above "Outstanding keys" — not side by side.

**Section 1 — Pending requests**: heading "Pending requests." Each queue card: a left colour stripe (red = High risk, amber = Medium, emerald = Low), key code (monospace), RiskTierBadge with its factors popover, a GuestBadge when the requester is external, a relative timestamp ("2 min ago"), requester/guest full name, room name, and a primary "Issue" button (disabled with a tooltip while offline). New items animate in with a brief 200ms slide (respecting reduced-motion). Loading = 3 skeleton rows. Empty = inbox icon, "No pending requests."

**Section 2 — Outstanding keys**: heading "Outstanding keys." Each row: a stripe (red = Overdue, emerald = normal), key code, an "Overdue" pill when applicable, a GuestBadge when the key was issued to a guest (no registered requester), relative issued time, room name, requester name or "External guest", "Return by [deadline]" (in destructive text when overdue), and a "Return" button (offline-guarded). Loading/empty states match Section 1's pattern ("No keys are currently issued").

**Issue sheet** (opens from a queue row or a persistent code-entry shortcut — top-right of the queue on desktop, a bottom-sheet trigger on mobile): two steps.

- _Code step_: a context card summarising the requester/guest, key, and RiskTierBadge; for High risk, a RiskAcknowledgement checkbox that must be ticked to enable submit; a 6-digit segmented code input; an inline error on an unrecognised/expired code ("Code not recognised or expired…").
- _Success step_: success card with a key icon, code/room, key_count shown if the key is part of a bunch, "Issued to [name] at [time]." For a **guest** issue specifically, an additional amber note line shows the declared ID document type/number ("Verify against National ID A1234567") — or a generic "Verify physical ID at the desk" fallback if no document type was declared.

**Return sheet** (opens from an outstanding-keys row): a context card (code, room, "Issued to [name] at [time]", key_count if a bunch, an overdue note if applicable), then either the default code-entry form or — via a "Requester can't provide a code?" link — the override form with its required reason textarea and a button labelled "Return without code." Success state matches either path, with the override path additionally showing "Returned without a requester code — CSO alerted."

Use placeholder data: Officer "Officer Musa", Shift 2, connected (green). Queue (4 items: one High-risk with visible factors and RiskAcknowledgement required, one Medium, two Low, one of which is a guest). Outstanding keys (5 items: one Overdue in red, one issued to "External guest", three normal).

Generate four variants: **default** at 1440px, **mobile** at 390px, **offline** (OfflineBanner + disabled actions), and **dark mode** at 1440px (the desk runs overnight; this matters).
