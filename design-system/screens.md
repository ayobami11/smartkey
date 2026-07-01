# SmartKey — Screens, Flows, and Information Architecture

This file is the companion to `DESIGN.md`. Where `DESIGN.md` describes the visual system Stitch must respect on every generation, this file describes _what to generate_ — the role-based information architecture, the user flows, and the per-screen specifications. Paste the relevant section into Stitch as prompt context when generating a specific screen or flow.

---

## How to use this file with Stitch

- **For a single screen**: paste that screen's spec from Section 4 plus the role's IA from Section 2 into the prompt.
- **For a complete flow**: paste the relevant flow from Section 3 plus all screens it touches.
- **For full role coverage**: paste the role's section in full.
- `DESIGN.md` is loaded automatically as persistent context; you do not need to paste it.

---

## 1. Project Context

SmartKey is a four-role web application replacing the paper-based key management workflow at the University of Lagos Senate Building. The roles are:

- **Chief Security Officer (CSO)**: senior administrator. Desktop-primary. Oversight, reports, audit log, user management.
- **Dean (system role: HOD)**: faculty Dean. Mixed device usage. Authorises up to three collectors per faculty key, signs weekend approvals.
- **Verifier (security personnel)**: 24/7 desk staff in 8-hour shifts. Shared desktop at the security desk. Issues and receives keys, performs shift handover.
- **Requester (university staff)**: lowest-frequency user. Phone-primary. Requests a key, receives a 6-digit code by email, presents it at the desk.

Three AI components run in the background:

1. **Risk scoring engine** — rule-based, evaluates each request and assigns Low/Medium/High tier visible to the verifier.
2. **Gemini-generated shift reports** — readable summaries from raw event data, surfaced on the CSO dashboard.
3. **Signature verification (Sharp + Pixelmatch)** — pixel-level match of Dean signatures against onboarded references.

Success criteria: 80–90% reduction in end-to-end request processing time vs the manual baseline; zero missing or malformed audit log entries; WCAG 2.2 AA conformance; LCP ≤ 2.5s, CLS < 0.1, Lighthouse ≥ 85.

---

## 2. Information Architecture

### 2.1 Public area (no authentication)

- `/` — Landing page: explains SmartKey, links to login, footer with UNILAG endorser.
- `/login` — Email + password, "forgot password" link, MFA prompt on submit.
- `/activate/:token` — Account activation: set password, accept terms, email OTP.
- `/forgot-password` — Email-OTP-based password reset.
- `/help` — Static FAQ and contact-the-CSO instructions.
- `/weekend-access` — External (non-registered) weekend request form: department, weekend date, work description, name/email/phone, ID document type + number, Dean authorisation letter upload.
- `/weekend-access/:token` — Session-less guest status/code page reached via the request's `access_token`: shows status, the Dean-assigned key once present, and the 6-digit code with countdown on the requested date.

### 2.2 CSO area

- `/cso` — Dashboard home (live key counts per zone, anomaly alerts, today's events).
- `/cso/reports` — Generated shift reports (Gemini-produced); download, comment.
- `/cso/audit` — Searchable, filterable audit log of every event.
- `/cso/users` — User management (provision new accounts, deactivate).
- `/cso/keys` — Key inventory across both zones; create / retire key records.
- `/cso/settings` — Operational hours, risk-rule weights, profile, theme.

### 2.3 Dean area

- `/hod` — Dashboard home: key grid for the faculty, weekend requests requiring action.
- `/hod/keys/:keyId` — Manage authorised collectors (max 3) for one key.
- `/hod/weekend-requests` — Review and decide weekend access requests.
- `/hod/onboarding` — One-time signature and stamp upload (forced on first login).
- `/hod/profile` — Profile, theme, notifications.

### 2.4 Verifier area

- `/verifier` — Dashboard home: pending requests, outstanding keys, shift state.
- `/verifier/issue` — Issue-key flow: enter code, confirm collector, mark issued.
- `/verifier/return` — Receive-key flow: select outstanding key, confirm return.
- `/verifier/handover` — Shift handover acknowledgement (locked screen until complete).
- `/verifier/incidents` — Log a new incident; review own shift history.

### 2.5 Requester area

- `/me` — Dashboard home: authorised keys grid, active request status.
- `/me/request/:keyId` — Request a key (weekday or weekend).
- `/me/request/:requestId/code` — Active code display with countdown.
- `/me/history` — Personal history of past requests.
- `/me/profile` — Profile, theme, notifications.

---

## 3. User Flows

### 3.1 First-time login (any role)

1. User receives provisioning email from CSO with activation link.
2. User clicks link → `/activate/:token`; sets password and accepts terms.
3. System sends 6-digit email OTP; user enters it.
4. Privileged roles (CSO, Dean/HOD, Verifier) confirm MFA preference (email OTP).
5. Deans are routed to `/hod/onboarding` to upload signature and stamp before any other action.
6. User lands on their role dashboard home.

### 3.2 Requester: standard weekday key request

Three interactions from `/me` to a code on screen.

1. On `/me`, tap an authorised key tile → opens the request sheet.
2. Confirm intended return time (defaults to end of business day, 17:00) and tap "Request key".
3. Code displays on `/me/request/:requestId/code` and is also emailed. 10-minute countdown starts.

Exit conditions:

- Code expires → user can request a new code from the same screen.
- Code is verified at the desk → screen updates to "Key issued — return by 17:00".

### 3.3 Requester: weekend access request

1. On `/me`, tap "Request weekend access" → form opens.
2. Select key, weekend date, work activity description, submit.
3. Confirmation card shows pending Dean approval; user notified by email when decision is made.

### 3.4 Dean: authorise a collector

1. On `/hod`, tap a key tile in the grid → opens slot management for that key.
2. Tap a vacant slot (max 3) → search staff by name or email; select.
3. Confirm authorisation; the staff member is now whitelisted for that key.

### 3.5 Dean: review weekend access request

1. On `/hod`, the weekend-requests panel shows pending items with badge count in nav.
2. Tap a request → detail sheet shows requester, key, date, description.
3. Choose Approve or Decline (with optional note). Approval auto-expires after 24 hours.

### 3.6 Verifier: issue a key (highest-frequency flow)

1. Verifier enters the 6-digit code presented by the collector.
2. Screen reveals: collector name, photo, requested key, risk tier (factors expandable).
3. Verifier confirms identity match → taps "Issue key". Done. Persistent confirmation with timestamp.

If risk is High: an explicit acknowledgement step is inserted between 2 and 3.

### 3.7 Verifier: receive a returned key

1. From the outstanding-keys list, tap the relevant row.
2. Confirm key code matches; tap "Mark returned".
3. Confirmation persists; row removed from outstanding list.

### 3.8 Verifier: shift handover

The dashboard is locked behind the handover screen at the start of every new shift. Outgoing officer's shift summary at top; outstanding keys below as a checklist. Incoming officer must acknowledge each (or bulk-acknowledge with explicit confirmation) before the dashboard unlocks.

### 3.9 CSO: review and download a generated shift report

1. On `/cso/reports`, tap the latest report card.
2. Read the Gemini-generated summary; expand the embedded ShiftTimeline if needed.
3. Add comments (saved as immutable audit additions) and download as PDF.

### 3.10 CSO: investigate an anomaly alert

1. From the dashboard alert feed, tap an alert.
2. The originating request opens with the contributing risk factors highlighted.
3. CSO can: contact the verifier, mark the alert as resolved with a note, or escalate to incident.

---

## 4. Screen Specifications

The five screens below are anchor screens. Other screens follow the same patterns and tokens.

### 4.1 Verifier dashboard home (highest stakes)

**Layout**: top app bar with user identity and shift status; left primary column for the live request queue (60% on desktop); right column with outstanding keys (40% on desktop). On mobile: queue first, outstanding-keys collapsible below. Whole screen receives Realtime updates.

**Required surfaces:**

- **Shift status indicator**: top-left of app bar; current officer name, shift number, time elapsed. Tappable to view shift summary.
- **Live request queue**: each row a card showing requester name, key, time of request (relative: "2 min ago"), risk tier badge, primary CTA "Issue".
- **Outstanding keys**: each row showing key code, room, collector, time issued, expected return time, overdue badge if past.
- **Code entry shortcut**: persistent floating action containing the code input. On desktop: top-right of queue. On mobile: bottom sheet trigger.
- **Realtime indicator**: small green dot in app bar when synced; amber when reconnecting; red when offline.

**Behaviour:**

- New requests appear at top of queue with brief 200ms slide-in (respects reduce-motion).
- Overdue keys re-sort to top of outstanding list and gain a red overdue badge.
- Tapping a queue row opens a side sheet with full request detail and the issue flow.

### 4.2 Requester dashboard home (mobile-first)

**Layout**: phone-first 360–428px viewport. Single column. Authorised keys in a 2-column grid of KeyTiles on phone, expanding to 3 or 4 columns on tablet/desktop. Active request, if any, occupies a banner above the grid.

**Required surfaces:**

- **Greeting**: "Good afternoon, Dr. Bakare." Time-of-day greeting; subtitle shows next steps if any.
- **Active request banner**: present only if user has an issued, unexpired code or an outstanding key. Shows code (if pre-collection) or "Return by 17:00" with countdown.
- **Authorised keys grid**: KeyTile per key (zone, room name, last used). Tap → request sheet.
- **Weekend request CTA**: secondary button below the grid: "Request weekend access".
- **Empty state**: when no keys authorised: friendly illustration + "Your Dean has not authorised any keys for you yet. Reach out to your faculty's Dean."

### 4.3 Dean dashboard home

**Layout**: two stacked sections on phone, two columns on desktop. Top: weekend requests requiring action (collapsible, badge with count). Bottom: faculty key grid showing each key with its three slots filled or vacant.

**Required surfaces:**

- **Pending requests panel**: list of weekend requests with requester, key, date, time. Accept/decline or open detail.
- **Key grid**: KeyTile per key. Each tile shows three slot indicators (filled/vacant). Tap → slot management.
- **Filter**: segmented control: "All keys" / "Has vacant slot" / "Recently used".
- **Onboarding nudge**: if signature or stamp not yet uploaded, persistent banner at top until complete; blocks weekend approvals until done.

### 4.4 CSO dashboard home

**Layout**: three-column desktop: left (LiveZoneCounter for both zones), centre (anomaly alert feed), right (today's key events stream). On smaller screens, right column collapses below.

**Required surfaces:**

- **LiveZoneCounter**: large numeric "X of Y keys checked out" per zone with trend arrow vs same time yesterday. Updates real-time.
- **Anomaly alert feed**: AnomalyAlertItem list, sorted by severity then recency. Severity stripe on the left of each card.
- **Events stream**: reverse-chronological list of all key events today (issued, returned, flagged). Tappable to open the related record.
- **Quick actions**: "Generate report now", "Search audit log", "View incidents".

### 4.5 Issue-key flow (verifier)

A side sheet that opens from the queue or via the code-entry shortcut. Three logical steps, never more than three taps.

**Step 1 — Code:**

- VerificationCodeInput receives the 6-digit code. Auto-validates as the sixth digit lands.
- Invalid code: input flashes destructive border, error microcopy below: "Code not recognised. Ask the requester to verify, or request a new code."

**Step 2 — Identity match:**

- Reveals: requester name and photo (if available), key code and room, risk tier badge.
- If risk is High, factors are visible (not hidden behind a tooltip), and the Issue button is replaced with an Acknowledgement checkbox + Confirm button.

**Step 3 — Confirm:**

- Single primary "Issue key" button. On tap: brief 300ms confirmation animation, sheet collapses, queue updates, persistent confirmation card appears at the top of the queue: "Issued to [name], 14:32". Audit log entry written.

---

## 5. Critical Workflows

### 5.1 Account provisioning and activation

CSO provisions an account by entering name, institutional email, and role. The system creates a record with status "Pending activation" and emails an activation link with a single-use, 24-hour token. The user clicks the link, sets a password (minimum 12 chars, mixed case, number, symbol), accepts terms, and verifies their email with a 6-digit OTP. On success, the account moves to "Active". Deans are then routed to the signature and stamp onboarding.

### 5.2 Key request to collection (weekday)

| Step                    | Actor                | System action                                                                               | Audit log                    |
| ----------------------- | -------------------- | ------------------------------------------------------------------------------------------- | ---------------------------- |
| Initiate request        | Requester            | Validate authorisation, evaluate risk, generate 6-digit code, set 10-min expiry, email code | Request created              |
| Enter code              | Verifier             | Look up request, retrieve risk and identity                                                 | Code looked up               |
| Confirm identity, issue | Verifier             | Mark key issued, start return-deadline timer                                                | Key issued: user, time, code |
| Return key              | Requester + Verifier | Verifier marks returned                                                                     | Key returned: user, time     |

### 5.3 Weekend access lifecycle

A weekend request is a separate object from a weekday key request. A requester submits one through their dashboard; the Dean sees it in their pending panel and approves or declines. On approval, the system generates a code valid only on the requested weekend date, signed (by the Dean's onboarded signature reference), and recorded immutably. The verification code expires 24 hours after the requested date passes.

**External (guest) variant.** The desk's real-world rule is that anyone may collect a key on the weekend provided they have Dean/CSO authorisation, so SmartKey also supports weekend requests from external people with no account. The guest submits at `/weekend-access` with their department, the weekend date, work description, name/email/phone, a declared ID document (type + number), and an uploaded Dean authorisation letter — they pick a department only, not a specific key. The request lands in the relevant Dean's pending panel flagged "External", showing the guest's details and letter. The Dean reviews the letter (no signature verification — guests have no reference signature), **assigns a key** from their faculty, and approves. The guest reaches a session-less status/code page via an unguessable token in their emailed link; on the requested date they mint the 6-digit code there, then present it at the desk, where the verifier checks the physical ID document (guests have no passport photo on file).

### 5.4 Shift handover

When a verifier opens the dashboard at the start of their shift, the system detects the shift change (clock-based) and locks the dashboard behind the handover screen. The screen shows: outgoing officer's shift summary, all currently outstanding keys, any unresolved incidents from the previous shift. The incoming officer must acknowledge each outstanding key. Bulk-acknowledge is permitted but requires an explicit confirmation dialog. Acknowledgement is logged with the incoming officer's identity and timestamp.

### 5.5 Signature verification

During Dean onboarding, the user uploads a scanned image of their signature and a separate image of the departmental stamp. The system processes each through Sharp (greyscale, normalised resolution) and stores the reference. When the Dean approves a weekend request, the embedded signature on the submission goes through the same preprocessing and is compared via Pixelmatch against the stored reference. Below threshold: approved silently. Above threshold: the request is held and a tampering alert is raised in the CSO feed.

### 5.6 Audit log search (CSO)

The audit log supports: free-text search on user names and key codes; filter by event type (request, issue, return, anomaly, handover, login, settings change); filter by zone; filter by date range; filter by user. Results render as a virtualised list with infinite scroll. Each row shows event type, actor, target, timestamp; tap to expand for full event payload. No row is editable.

---

## 6. State Catalogue

Every async surface needs four states: empty, loading, error, content. Plus offline for any surface that depends on real-time data.

### 6.1 Empty states

| Surface                        | Empty state copy                                       | Primary action |
| ------------------------------ | ------------------------------------------------------ | -------------- |
| Requester authorised keys grid | Your Dean has not authorised any keys for you yet.     | Contact Dean   |
| Requester history              | You have not requested a key yet.                      | —              |
| Dean key grid                  | No keys assigned to your faculty yet. Contact the CSO. | Contact CSO    |
| Dean pending weekend requests  | No pending requests right now.                         | —              |
| Verifier queue                 | No pending requests. New ones will appear here.        | —              |
| Verifier outstanding keys      | No keys are currently issued.                          | —              |
| CSO anomaly feed               | No anomalies in the last 24 hours.                     | —              |
| CSO reports                    | No shift reports generated yet.                        | Generate now   |
| CSO audit log results          | No events match these filters.                         | Reset filters  |
| Notification centre            | No notifications yet.                                  | —              |

### 6.2 Loading

- Skeleton elements with same dimensions as content they replace (prevents CLS).
- Subtle shimmer animation that respects reduce-motion.
- After 5s without data: keep skeleton but show "Still loading..." caption.
- After 15s: show retry CTA and contact-CSO secondary action.

### 6.3 Error

- Inline errors next to the offending field with destructive colour and icon.
- Page-level errors use a card: short heading "Something went wrong", specific detail, primary action "Try again", secondary "Get help".
- Never expose stack traces. Show correlation ID: "Error reference: 7f3e9b22 — share this with the CSO if you contact support."

### 6.4 Offline / degraded

- OfflineBanner persistent at top: "You are offline. Live updates are paused. New requests will appear when you reconnect."
- Destructive and authoritative actions disable while offline. Tooltip: "Available again when you reconnect."
- Read-only actions remain available with last-known data.

### 6.5 Success / confirmation

- Persistent on-page confirmation card with the named outcome. Toast may accompany, never replace.
- Auto-dismiss only for transient operations (theme toggle). Audit-significant operations always persist.

---

## 7. Notifications and Real-Time Behaviour

### 7.1 Channels

| Trigger                              | Channel                                           | Recipient                 |
| ------------------------------------ | ------------------------------------------------- | ------------------------- |
| Account provisioned                  | Email (activation link)                           | New user                  |
| Verification code generated          | Email (with code) + in-app banner                 | Requester                 |
| New key request arrives              | In-app realtime + optional sound (off by default) | Verifier on duty          |
| Key issued                           | In-app confirmation                               | Requester (status update) |
| Key overdue (past EOD return)        | Email + in-app                                    | Requester + CSO           |
| Weekend request submitted            | In-app + email                                    | Dean                      |
| Weekend request decided              | Email + in-app                                    | Requester                 |
| Anomaly detected (any tier ≥ Medium) | In-app realtime                                   | CSO                       |
| Signature mismatch                   | In-app realtime + email                           | CSO                       |
| Shift change detected                | In-app prompt on next dashboard load              | Incoming verifier         |

### 7.2 Realtime mechanics

Use Supabase Realtime (Postgres changes streamed via websocket). Every dashboard subscribes to its relevant tables on mount. Connection state visualised at the top of the dashboard via a small dot (green/amber/red). Reconnect on disconnect with exponential backoff up to 30 seconds. After 30 seconds, show persistent OfflineBanner.

### 7.3 Notification rules

- Toasts are for transient confirmations only (3-second auto-dismiss). Never show critical information solely via toast.
- Persistent banners are for state that affects what the user can do.
- Sound is opt-in only and respects OS Do Not Disturb where exposed.
- In-app notification centre: top-right bell icon with badge count; opens a sheet listing the last 50 notifications, grouped by day.

---

## 8. Responsive Breakpoints

| Token | Width       | Target                    |
| ----- | ----------- | ------------------------- |
| xs    | ≤ 480px     | Phone                     |
| sm    | 481–768px   | Large phone, small tablet |
| md    | 769–1024px  | Tablet, small laptop      |
| lg    | 1025–1440px | Standard desktop          |
| xl    | > 1440px    | Wide desktop              |

Layout patterns:

- **Verifier dashboard**: two-column at lg+; stacks at md and below; outstanding-keys collapses behind a tab on xs.
- **CSO dashboard**: three-column at lg+; two-column at md (events stream collapses); single column with tabs at sm/xs.
- **Requester home**: single column always. Grid 2-up at xs, 3-up at md, 4-up at lg.
- **Dean key grid**: single column at xs; 2-up at sm; 3-up at lg.
- **Code display**: always centred, full viewport width on xs, max 480px on larger.

---

## 9. AI Surfaces

### 9.1 Risk scoring engine

- **Where**: verifier dashboard, every queued request, inside the issue-key flow.
- **Treatment**: RiskTierBadge (pill with status colour + icon + tier label). Heading-md size — non-trivial.
- **Factor reveal**: subtle "View factors" link beneath the badge opens a popover listing each contributing rule with its weight in plain English ("Outside operational hours for New Senate (weight 3)").
- **High-risk gating**: explicit acknowledgement step inserted in the issue flow before the verifier can proceed.

### 9.2 Gemini-generated shift reports

- **Where**: CSO Reports area; one card per shift.
- **Treatment**: long-form readable card with sections: outstanding keys, flagged events, unresolved incidents, chain-of-custody summary. Body-md prose; embedded ShiftTimeline for visual log.
- **Editing**: report itself is immutable. CSO can add comments (timestamped, signed) and download the comments alongside as a single PDF.
- **Disclosure**: small "Generated by AI from shift event data" caption at foot of every report.

### 9.3 Signature verification

- **Where**: silently in the background of Dean-signed approvals; explicitly when a mismatch is detected.
- **On match**: no UI surface; subtle audit-log entry "Signature verified".
- **On mismatch**: CSO dashboard receives a tampering alert. Detail shows the reference signature, the failed sample, the mismatch percentage, and a link to the underlying request. Approval is held until CSO action.

---

## 10. Open Questions for Stakeholders

These do not block design start but should be resolved before high-fidelity sign-off.

- Will the SmartKey wordmark be designed in-house or procured separately?
- Is there a printer at the security desk, or are reports read on-screen and exported as PDF?
- Should overdue-key reminders escalate (e.g., a second nudge after 1 hour past EOD)?
- Who owns the operational hours configuration per zone — CSO only, or Deans for their faculty?
- On signature mismatch, can the Dean self-resolve (re-upload reference) or must the CSO unblock?
- Sound alerts at the verifier desk — opt-in default; should we ship a sample audio?
- Pilot tablet model for UAT — what specific device should layout testing target?
- Retention policy: how long do audit logs and shift reports remain queryable in the UI before archive?
