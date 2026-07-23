# Requester History

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/me/history` — Personal request history** screen.

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

## Responsive breakpoints

- xs ≤ 480px (phone)
- sm 481–768px (large phone, small tablet)
- md 769–1024px (tablet, small laptop)
- lg 1025–1440px (standard desktop)
- xl > 1440px (wide desktop)

Generate the screen at xs (mobile) and lg (desktop) at minimum. Touch targets minimum 44×44px.

---

## Generation request

Generate the requester history page (`/me/history`).

**Layout**: full page. Back chevron to `/me` at top-left. Page heading "Your request history".

**Filter chips** at top (horizontal scroll on mobile, single row on desktop): "All", "Returned", "Currently issued", "Expired unused", "This month".

**List**: reverse-chronological list of past requests grouped by month, with sticky month headers (e.g., "May 2026"). Each row is a card showing:

- Key name and zone (left, primary content)
- Date and time of request (subline, body-sm muted-foreground)
- Status badge (right): Returned (success-soft), Currently issued (info-soft), Expired unused (muted), Cancelled (neutral)
- Tap to expand inline → reveals the full event timeline for that request: requested → code issued → key collected → key returned, each with timestamp.

**Empty states**:

- No history at all: "You haven't requested a key yet." with primary "Go to dashboard" link.
- Filter returns no results: "No requests match this filter." with "Clear filter" link.

**Use placeholder data** (8 requests across the last two months):

- May 2026: NS-304 returned (yesterday), NS-305 currently issued (today), OS-12 returned (3 days ago).
- April 2026: NS-304 returned (5 weeks ago), NS-305 expired unused (4 weeks ago), OS-12 returned (3 weeks ago), NS-306 returned (2 weeks ago), NS-304 cancelled by user (1 week ago).

Show one row expanded to demonstrate the event timeline.

Generate at 390px (mobile, primary) and 1440px (desktop).
