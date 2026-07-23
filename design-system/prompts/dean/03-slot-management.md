# HOD Key Slot Management

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/hod/keys/:keyId` — Manage authorised collectors for a key** screen.

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

## Flow: HOD authorises a collector

1. On `/hod`, tap a key tile in the grid → opens slot management for that key.
2. Tap a vacant slot (max 3) → search staff by name or email; select.
3. Confirm authorisation; the staff member is now whitelisted for that key.

## Responsive breakpoints

- xs ≤ 480px (phone)
- sm 481–768px (large phone, small tablet)
- md 769–1024px (tablet, small laptop)
- lg 1025–1440px (standard desktop)
- xl > 1440px (wide desktop)

Generate the screen at xs (mobile) and lg (desktop) at minimum. Touch targets minimum 44×44px.

---

## Generation request

Generate the HOD key slot management screen (`/hod/keys/:keyId`).

**Layout**: top app bar with back chevron to `/hod`. Below: key metadata header (key code, room name, zone, department).

**Main content**: three large slot cards in a row (stack on mobile). Each slot card is either:

- **Filled**: shows the staff member's name, photo, email, date authorised. Three actions: "View activity" (link), "Replace" (button), "Remove" (destructive ghost link).
- **Vacant**: dashed border, soft background, large "+ Add collector" button in the centre.

Below the slot cards: a "Recent activity for this key" section — small list of the last 5 events on this key (issued, returned, requests).

**Add collector dialog** (opened from a vacant slot):
Modal titled "Authorise collector for [NS-304, Senate Room 304]". Fields:

- Search input "Search staff by name or email" with autocomplete from departmental staff list.
- Selected staff card (appears below search once chosen): photo, name, email, department.
- Confirmation checkbox: "I confirm this staff member is authorised to collect this key." (required)
- Primary "Authorise" button.

After authorisation: dialog replaced by success state with named confirmation: "Authorised Dr. Bakare for NS-304 on [date]." with "Done" button.

**Replace flow**: same dialog, prefilled with the existing collector's name in a strikethrough, plus the search to choose a replacement. Confirmation: "Replace Dr. Bakare with [new staff]?"

**Remove flow**: confirmation dialog "Remove Dr. Bakare from NS-304? This will revoke their authorisation immediately. Outstanding requests are not affected." Destructive button "Remove".

Use placeholder data: NS-304, two filled slots (Dr. Bakare, Eng. Adeyemi), one vacant slot. Generate at 1440px (desktop) and 390px (mobile).
