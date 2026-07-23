# Shared blocks — canonical source text

This file is **not** pasted into Stitch. It is the single editing source for the blocks of text duplicated verbatim across the 34 per-screen prompt files. When something here changes (a route, a role name, a flow), update it here first, then propagate the new text into every file listed under "Used by."

Each per-screen file must stay a single self-contained paste (Stitch prompts can't `#include` another file), so the duplication itself is not the problem being solved — the problem being solved is **drift**: this file is the one place to check before touching any of the 34.

---

## Project Context

Used by: every file (all 34).

```
SmartKey is a four-role web application replacing the paper-based key management workflow at the University of Lagos Senate Building. The roles are:

- **Chief Security Officer (CSO)**: senior administrator. Desktop-primary. Oversight, reports, audit log, user management.
- **Dean** (system role `DEAN`): faculty member. Mixed device usage. Authorises up to three collectors per unit key, signs weekend approvals. The Administration unit's keys are authorised by the CSO instead — no Dean exists for it.
- **Verifier (security personnel)**: 24/7 desk staff in 8-hour shifts. Shared desktop at the security desk. Issues and receives keys, performs shift handover.
- **Requester (university staff)**: lowest-frequency user. Phone-primary. Requests a key, receives a 6-digit code by email, presents it at the desk.

Three AI components run in the background: rule-based risk scoring (visible to verifiers as Low/Medium/High tier), Gemini-generated shift reports (CSO dashboard), and pixel-level signature verification (Dean-signed approvals). WCAG 2.2 AA conformance is the floor. Use the SmartKey design system from DESIGN.md — do not invent colours, typography, or component styling.

Grouping term: SmartKey organises keys by **Unit** (not "Department" or "Faculty" — the app renamed this concept; the UI label is always "Unit", e.g. "Faculty of Engineering" is a Unit).
```

---

## Route tables (per role)

### Public

Used by: `public/*` (all 8 files).

```
- `/` — Landing page (explains SmartKey, links to login and to weekend access)
- `/login` — Email + password, then a 6-digit email-OTP step (MFA)
- `/activate/:token` — Account activation: set password; passport-photo upload required for Requesters only, not Verifiers
- `/forgot-password` — Request a password-reset email
- `/reset-password` — Set a new password (reached via the emailed link); has its own expired-link state
- `/help` — Static FAQ and contact-the-CSO instructions
- `/weekend-access` — External (non-registered) weekend key request form — no account needed
- `/weekend-access/:token` — Session-less guest status/code page, reached via an unguessable link emailed at submission
```

### CSO

Used by: `cso/*` (all 8 files).

```
- `/cso/dashboard` — Dashboard home (pending decisions, live per-zone key counts, anomaly/signature alerts, trend charts)
- `/cso/admin-keys` — Administration-unit key inventory + collector slot management (CSO is the authoriser for Administration; there is no Dean for it)
- `/cso/audit` — Audit Log and Incidents in one tabbed screen, searchable and filterable
- `/cso/users` — User list, provisioning, editing, revoking access
- `/cso/keys` — Key inventory across both zones; create keys, mark lost/retired
- `/cso/reports` — Generated shift reports (Gemini-produced) list + detail; comment, download PDF
- `/cso/settings` — Operational hours, risk-rule weights, notifications, account
- `/cso/weekend-requests` — Review queue for Administration-unit weekend requests
```

### Dean

Used by: `dean/*` (all 6 files).

```
- `/dean/dashboard` — Dashboard home: pending weekend requests, recent key activity, collectors table (no key grid here — that moved to its own route)
- `/dean/keys` — Unit key inventory grid
- `/dean/keys/:keyId` — Manage authorised collectors (max 3) for one key
- `/dean/weekend-requests` — Review and decide weekend access requests (registered and guest)
- `/dean/onboarding` — One-time signature and stamp upload, forced on first login
- `/dean/settings` — Account, signature & stamp replacement, notifications
```

### Verifier

Used by: `verifier/*` (all 5 files).

```
- `/verifier/dashboard` — Live request queue and outstanding keys, with the issue-key and return-key flows opening as side sheets from this one screen — there are no separate /verifier/issue or /verifier/return routes
- `/verifier/handover` — Shift handover acknowledgement, locked at the start of every shift; also covers the "no prior shift / start a shift" state
- `/verifier/incidents` — Log a new incident; review own shift's incidents
```

### Requester

Used by: `requester/*` (all 7 files).

```
- `/requester/dashboard` — Dashboard home: active collection-code banner, outstanding keys (with a return-code sheet), authorised keys grid, weekend requests panel. Weekday and weekend requests both open as Sheets from this dashboard — there is no separate /requester/request/:keyId or /requester/request/weekend route
- `/requester/request/:requestId/code` — Active collection-code display with countdown (also used for the weekend on-the-day code)
- `/requester/history` — Personal history of past requests
- `/requester/settings` — Account (incl. photo), notifications
```

---

## Flow blocks

### Flow: First-time login (any role)

Used by: `public/02-login.md`, `public/03-activation.md`, `cso/04-users.md`.

```
1. User receives provisioning email from CSO with an activation link.
2. User clicks the link → `/activate/:token`; sets a password. Passport-photo upload is required at this step for Requesters only — Verifiers do not upload a photo.
3. System sends a 6-digit email OTP; user enters it (segmented OTP input, 10-minute expiry, "Resend code" with a 60-second cooldown).
4. Privileged roles (CSO, Dean, Verifier) confirm MFA via email OTP on **every** login, not just the first.
5. Deans are routed to `/dean/onboarding` to upload their signature and stamp before any other action.
6. User lands on their role dashboard home.
```

### Flow: Weekday key request (Requester)

Used by: `requester/01-dashboard.md`, `requester/02-request-key.md`, `requester/03-code-display.md`.

```
Three interactions from the dashboard to a code on screen.

1. On `/requester/dashboard`, tap an authorised key tile → opens the request sheet.
2. Confirm the intended return time (defaults to the end of the current day, 23:59) and tap "Request key".
3. Code displays on `/requester/request/:requestId/code` and is also emailed. A 10-minute countdown starts.

Exit conditions: the countdown reaching 0 auto-fires an expire call and the code is replaced by a "Request a new code" prompt on the same screen. Code verified at the desk → screen updates to "Key issued — return by [deadline]".
```

### Flow: Weekend access request (registered requester)

Used by: `requester/01-dashboard.md`, `requester/04-weekend-request.md`.

```
1. On the requester dashboard, the Weekend requests panel has a "Weekend access" button that opens the WeekendAccessSheet.
2. Select an authorised key, a weekend date (Saturday/Sunday only), a reason for access, and — optionally — upload a photo of the Dean's signature on a physical authorisation (enables automatic pixel-level signature verification when the Dean decides).
3. The sheet shows a "Waiting for approval" confirmation; the requester is notified by email once the Dean decides.
4. On approval the request sits as APPROVED until the requested date. On the day, the requester mints a short-lived 6-digit collection code from the dashboard (same code page as the weekday flow) — the code is never issued ahead of the date.

A weekend request is a distinct object from a weekday key request, and the code is only minted on the requested date (10-minute expiry), never at approval time.
```

### Flow: Guest/external weekend access request

Used by: `public/07-weekend-access-request.md`, `public/08-weekend-access-status.md`, `cso/08-weekend-requests.md`, `dean/04-weekend-requests.md`.

```
1. An external person with no SmartKey account visits `/weekend-access` (linked from the login page and the landing page).
2. They submit: full name, email, phone (optional), a declared ID document (type + number — checked physically at the desk, since guests have no passport photo on file), the unit they need access within, a free-text description of the room/area needed, a weekend date, and an uploaded Dean/CSO authorisation letter (PDF or image).
3. On submit, the guest reaches a session-less status page at `/weekend-access/:token` (keyed by an unguessable access token) and receives the same link by email as a fallback.
4. The relevant Dean (or the CSO, for a request routed to Administration) reviews the uploaded letter, assigns a specific key from their unit, and approves or declines. No signature verification runs for guests — there is no reference signature to compare against, so the letter is reviewed manually.
5. On the requested date, the guest mints their own 6-digit collection code from the status page, then later a 6-digit return code after collecting the key (same generate-code pattern, both 15/10-minute windows). The verifier checks the physical ID document at the desk, not a photo.
```

### Flow: Collector authorisation

Used by: `dean/02-keys.md`, `dean/03-slot-management.md`, `cso/07-admin-keys.md`.

```
1. On `/dean/keys`, tap a key tile → opens slot management for that key.
2. Tap a vacant slot (max 3) → search staff by name or email within the Dean's own unit; select.
3. Confirm authorisation; the staff member is now whitelisted for that key.

For Administration-unit keys, the CSO performs the equivalent flow from `/cso/admin-keys` instead — candidates are drawn from all active Requester accounts system-wide, since Administration has no Dean or fixed unit staff list.
```

### Flow: Issue a key (Verifier)

Used by: `verifier/01-dashboard.md`, `verifier/02-issue-key.md`.

```
1. Verifier enters the 6-digit code presented by the collector — either via the persistent code-entry shortcut or by tapping a queue row.
2. Screen reveals: requester name and photo (or, for a guest request, the declared ID document type/number instead — no photo exists for guests), the requested key, and a RiskTierBadge with expandable factors.
3. Verifier confirms identity match → taps "Issue key". Persistent confirmation with timestamp; for a guest issue, the confirmation additionally reminds the verifier to check the physical ID document against what was declared.

If risk is High: an explicit RiskAcknowledgement checkbox is inserted before the Issue button enables, requiring the verifier to read the contributing factors first.
```

### Flow: Receive a returned key (Verifier)

Used by: `verifier/01-dashboard.md`, `verifier/03-receive-key.md`.

```
1. From the outstanding-keys list, tap the relevant row → opens the return sheet.
2. Default path: ask the requester for their 6-digit return code (the requester generates this themselves from their own dashboard, 15-minute expiry) and enter it → "Confirm return".
3. Fallback path: if the requester can't produce a code, a "Requester can't provide a code?" link switches to an override form — a required reason textarea replaces the code input. This records an **unverified** return and automatically raises a `SUSPICIOUS_ACTIVITY` incident to the CSO.
4. Confirmation persists and the row is removed from outstanding. The unverified path's confirmation additionally discloses, in an amber note: "Returned without a requester code — CSO alerted."
```

### Flow: Shift handover

Used by: `verifier/01-dashboard.md`, `verifier/04-shift-handover.md`.

```
The dashboard is locked behind the handover screen at the start of every new shift. If there is no prior shift at all to hand over from, the screen instead shows a "Start shift" state: a read-only list of any currently outstanding keys and a single "Start shift" button — no per-key acknowledgement required. Otherwise: the outgoing officer's shift summary sits at the top; outstanding keys are listed below as a checklist with a tri-state select-all row plus per-row checkboxes. The incoming officer must acknowledge each key (or bulk-acknowledge with an explicit confirmation dialog) before the dashboard unlocks. Acknowledgement is logged with the incoming officer's identity and timestamp.
```

---

## AI surface blocks

### AI surface: Risk scoring engine

Used by: `cso/01-dashboard.md`, `verifier/01-dashboard.md`, `verifier/02-issue-key.md`.

```
- **Treatment**: RiskTierBadge — a pill with status colour + shield icon + tier label ("Low risk" / "Medium risk" / "High risk"). Non-trivial size, not a small decoration.
- **Factor reveal**: a "View factors" text-link beneath the badge opens a popover (RiskFactorPopover) listing each contributing rule in plain English with its numeric weight ("Outside operational hours — weight 3").
- **High-risk gating**: an explicit RiskAcknowledgement checkbox ("I have reviewed the contributing factors above.") is inserted in the issue flow before the verifier can proceed — it is never possible to issue a high-risk key with a single tap.
```

### AI surface: Gemini-generated shift reports

Used by: `cso/02-reports.md`, `verifier/04-shift-handover.md`.

```
- **Treatment**: long-form readable card with sections in order: summary, outstanding keys, flagged events, unresolved incidents, chain-of-custody. Body-md prose; an embedded ShiftTimeline component (vertical timeline, one node per event) renders the structured event log alongside the prose.
- **Editing**: the report itself is immutable once generated. The CSO can add comments (timestamped, attributed) and download the report plus comments as a single PDF. There is also a lightweight "quick comment" entry point from the reports list, without opening the full detail page.
- **Disclosure**: a small caption at the foot of every report reads "Generated by AI from shift event data" — visible even when the deterministic template fallback produced it instead of Gemini.
```

### AI surface: Signature verification

Used by: `dean/04-weekend-requests.md`, `dean/06-settings.md`, `cso/01-dashboard.md`, `cso/08-weekend-requests.md`.

```
- **On match**: no UI surface. A subtle audit-log entry "Signature verified" is written and the approval proceeds automatically.
- **On mismatch (weekend approval)**: the approval is held rather than applied. A SignatureMismatchAlerts card surfaces on the CSO dashboard showing the reference signature and the submitted sample side by side with the mismatch percentage. The CSO can Decline or "Approve anyway" — the override is gated behind an explicit acknowledgement checkbox, never a single click.
- **On mismatch (Dean replacing their own reference in Settings)**: the update is held for CSO review instead of applying immediately. An amber "Update held for CSO review" state shows the mismatch percentage; approvals already pending against the *previous* reference are unaffected by the hold.
- Guest/external weekend requests never run signature verification — there is no reference signature for a guest to compare against, so the Dean/CSO reviews the uploaded authorisation letter manually instead.
```

---

## Notifications and realtime behaviour

Used by: `cso/01-dashboard.md`, `dean/01-dashboard.md`, `verifier/01-dashboard.md`, `requester/03-code-display.md`.

```
- Persistent banners are for state that affects what the user can do (offline, onboarding incomplete, shift not handed over).
- Toasts are for transient confirmations only (3-second auto-dismiss). Never show critical information solely via toast.
- Realtime updates: small dot in app bar (green connected / amber reconnecting / red offline) shows connection state.
- Notification centre: top-right bell icon with badge count.
```

## State coverage required

Used by: `cso/03-audit.md`, `verifier/01-dashboard.md`, `public/08-weekend-access-status.md`.

```
For every async surface in this screen, design four states: empty, loading (skeleton placeholders sized to match final content, no layout shift), error (inline near the offending field, plus a page-level fallback card with a correlation ID), and content.

If the screen depends on realtime data, also design the offline state: persistent OfflineBanner at the top, destructive actions disabled with a tooltip "Available again when you reconnect."
```

## Responsive breakpoints

Used by: every file (all 34).

```
- xs ≤ 480px (phone)
- sm 481–768px (large phone, small tablet)
- md 769–1024px (tablet, small laptop)
- lg 1025–1440px (standard desktop)
- xl > 1440px (wide desktop)

Generate the screen at xs (mobile) and lg (desktop) at minimum. Touch targets minimum 44×44px.
```
