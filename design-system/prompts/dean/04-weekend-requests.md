# HOD Weekend Request Review

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/hod/weekend-requests` — Pending weekend access requests** screen.

---

## Project Context

SmartKey is a four-role web application replacing the paper-based key management workflow at the University of Lagos Senate Building. The roles are:

- **Chief Security Officer (CSO)**: senior administrator. Desktop-primary. Oversight, reports, audit log, user management.
- **Head of Department (HOD)**: faculty member. Mixed device usage. Authorises up to three collectors per departmental key, signs weekend approvals.
- **Verifier (security personnel)**: 24/7 desk staff in 8-hour shifts. Shared desktop at the security desk. Issues and receives keys, performs shift handover.
- **Requester (university staff)**: lowest-frequency user. Phone-primary. Requests a key, receives a 6-digit code by email, presents it at the desk.

Three AI components run in the background: rule-based risk scoring (visible to verifiers as Low/Medium/High tier), Gemini-generated shift reports (CSO dashboard), and pixel-level signature verification (HOD signed approvals). WCAG 2.2 AA conformance is the floor. Use the SmartKey design system from DESIGN.md — do not invent colours, typography, or component styling.

## HOD area routes

- `/hod` — Dashboard home: department key grid, weekend requests requiring action
- `/hod/keys/:keyId` — Manage authorised collectors (max 3) for one key
- `/hod/weekend-requests` — Review and decide weekend access requests
- `/hod/onboarding` — One-time signature and stamp upload (forced on first login)
- `/hod/profile` — Profile, theme, notifications

## Flow: HOD reviews weekend access request

1. On `/hod`, the weekend-requests panel shows pending items with badge count in nav.
2. Tap a request → detail sheet shows requester, key, date, description.
3. Choose Approve or Decline (with optional note). Approval auto-expires after 24 hours.

## AI surface: Signature verification

- **On match**: no UI surface; subtle audit-log entry "Signature verified".
- **On mismatch**: CSO dashboard receives a tampering alert. Detail shows the reference signature, the failed sample, the mismatch percentage, and a link to the underlying request. Approval is held until CSO action.

## Responsive breakpoints

- xs ≤ 480px (phone)
- sm 481–768px (large phone, small tablet)
- md 769–1024px (tablet, small laptop)
- lg 1025–1440px (standard desktop)
- xl > 1440px (wide desktop)

Generate the screen at xs (mobile) and lg (desktop) at minimum. Touch targets minimum 44×44px.

---

## Generation request

Generate the HOD weekend request review screen (`/hod/weekend-requests`). Two views: list and detail.

**List view (`/hod/weekend-requests`)**:
Tabs at top: "Pending" (default, with badge count), "Decided this week", "All".

Each request renders as a card with: requester name and photo, requested key (code + room), requested date (weekend date in human format e.g. "Sat 3 May 2026"), submitted at (relative: "2h ago"), work activity summary (truncated to 120 chars). Primary "Review" button on the right. On mobile, the card is full-width and tapping anywhere opens the detail sheet.

Empty state for "Pending": "No pending requests right now." with a friendly note "Weekend requests appear here when staff submit them."

**Detail sheet** (slides in from right on desktop, full-screen on mobile):
Sections, top to bottom:

1. **Header**: requester name, photo, department, "Submitted [date+time]".
2. **Request details**: key (code, room, zone), requested weekend date, full work activity description (no truncation).
3. **Authorisation context**: small card showing whether this requester is currently whitelisted on the key. If not, an amber-soft warning: "This requester is not currently whitelisted for this key. Approval will grant temporary 24-hour access."
4. **Decision**: two large buttons side by side — primary maroon "Approve and sign" / destructive ghost "Decline". Below them, an optional textarea labelled "Note to requester (optional, included in the email)".

**Approve confirmation**: modal asking the HOD to confirm the digital signature will be applied. "Approve and sign" button confirms. After approval, the sheet shows a success state: "Approved. [Requester] has been notified by email." with the standard signature-applied caption "Signed with your stored signature reference at [time]."

**Decline confirmation**: modal "Decline this request?" with the note (if provided) shown back. Destructive "Decline" button. After decline, sheet shows "Declined. [Requester] has been notified."

Use placeholder data: 3 pending requests with varied contexts (one whitelisted, one not whitelisted with the warning). Show the detail sheet at the "Decision" step. Generate at 1440px (desktop) and 390px (mobile).
