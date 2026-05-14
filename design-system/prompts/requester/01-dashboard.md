# Requester Dashboard Home

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/me` — Requester dashboard home (mobile-first)** screen.

---

## Project Context

SmartKey is a four-role web application replacing the paper-based key management workflow at the University of Lagos Senate Building. The roles are:

- **Chief Security Officer (CSO)**: senior administrator. Desktop-primary. Oversight, reports, audit log, user management.
- **Head of Department (HOD)**: faculty member. Mixed device usage. Authorises up to three collectors per departmental key, signs weekend approvals.
- **Verifier (security personnel)**: 24/7 desk staff in 8-hour shifts. Shared desktop at the security desk. Issues and receives keys, performs shift handover.
- **Requester (university staff)**: lowest-frequency user. Phone-primary. Requests a key, receives a 6-digit code by email, presents it at the desk.

Three AI components run in the background: rule-based risk scoring (visible to verifiers as Low/Medium/High tier), Gemini-generated shift reports (CSO dashboard), and pixel-level signature verification (HOD signed approvals). WCAG 2.2 AA conformance is the floor. Use the SmartKey design system from DESIGN.md — do not invent colours, typography, or component styling.

## Requester area routes

- `/me` — Dashboard home: authorised keys grid, active request status
- `/me/request/:keyId` — Request a key (weekday or weekend variant)
- `/me/request/:requestId/code` — Active code display with countdown
- `/me/history` — Personal history of past requests
- `/me/profile` — Profile, theme, notifications

## Flow: Standard weekday key request (Requester)

Three interactions from `/me` to a code on screen.

1. On `/me`, tap an authorised key tile → opens the request sheet.
2. Confirm intended return time (defaults to end of business day, 17:00) and tap "Request key".
3. Code displays on `/me/request/:requestId/code` and is also emailed. 10-minute countdown starts.

Exit conditions: code expires → user can request a new code from the same screen. Code is verified at the desk → screen updates to "Key issued — return by 17:00".

## Screen spec: Requester dashboard home

**Layout**: phone-first 360–428px viewport. Single column. Authorised keys in a 2-column grid of KeyTiles on phone, expanding to 3 or 4 columns on tablet/desktop. Active request, if any, occupies a banner above the grid.

**Required surfaces:**

- **Greeting**: "Good afternoon, Dr. Bakare." Time-of-day greeting; subtitle shows next steps if any.
- **Active request banner**: present only if user has an issued, unexpired code or an outstanding key. Shows code (if pre-collection) or "Return by 17:00" with countdown.
- **Authorised keys grid**: KeyTile per key (zone, room name, last used). Tap → request sheet.
- **Weekend request CTA**: secondary button below the grid: "Request weekend access".
- **Empty state**: when no keys authorised: friendly illustration + "Your HOD has not authorised any keys for you yet. Reach out to your department's HOD."

## Responsive breakpoints

- xs ≤ 480px (phone)
- sm 481–768px (large phone, small tablet)
- md 769–1024px (tablet, small laptop)
- lg 1025–1440px (standard desktop)
- xl > 1440px (wide desktop)

Generate the screen at xs (mobile) and lg (desktop) at minimum. Touch targets minimum 44×44px.

---

## Generation request

Generate the requester dashboard home (`/me`) using the spec above.

**Placeholder data**:

- Requester "Dr. Bakare", time of day "Good afternoon"
- Active request banner: code "482917" with countdown "7:42 remaining", key "NS-304, Senate Room 304"
- Authorised keys grid (4 keys):
  - NS-304, Senate Room 304, last used "2 days ago"
  - NS-305, Senate Room 305, last used "Last week"
  - OS-12, Old Senate Room 12, last used "Never"
  - OS-13, Old Senate Room 13, last used "1 month ago"

Generate four variants:

1. **Mobile (default)** at 390px with the active request banner at top, 2-column key grid below.
2. **Desktop** at 1440px with the same content but 4-column grid.
3. **Empty state** (mobile, no authorised keys yet) — friendly illustration + "Your HOD has not authorised any keys for you yet. Reach out to your department's HOD." with no active request banner.
4. **No active request** (mobile) — same data but the active request banner is absent (the user has no current code or outstanding key).

Mobile is the primary reference; the desktop is a secondary scale-up.
