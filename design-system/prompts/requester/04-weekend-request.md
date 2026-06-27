# Requester Weekend Access Request

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/me/request/weekend` — Weekend access request form** screen.

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

## Flow: Weekend access request (Requester)

1. On `/me`, tap "Request weekend access" → form opens.
2. Select key, weekend date, work activity description, submit.
3. Confirmation card shows pending HOD approval; user notified by email when decision is made.

A weekend request is a separate object from a weekday key request. On HOD approval, the system generates a code valid only on the requested weekend date, signed by the HOD's onboarded signature reference, and recorded immutably. The verification code expires 24 hours after the requested date passes.

## Responsive breakpoints

- xs ≤ 480px (phone)
- sm 481–768px (large phone, small tablet)
- md 769–1024px (tablet, small laptop)
- lg 1025–1440px (standard desktop)
- xl > 1440px (wide desktop)

Generate the screen at xs (mobile) and lg (desktop) at minimum. Touch targets minimum 44×44px.

---

## Generation request

Generate the "Request weekend access" form (`/me/request/weekend`).

**Layout**: full page on mobile, centred max-480px card on desktop. Back chevron to `/me` at top-left.

**Heading**: "Request weekend access" with a body-sm subhead: "Weekend access requires HOD approval. You'll be notified by email once a decision is made."

**Form fields**:

1. **Key** (select): dropdown of authorised keys grouped by zone. Required.
2. **Weekend date** (date picker): only Saturdays and Sundays selectable; only future dates within the next 30 days. Required.
3. **Work activity description** (textarea): required, 50–500 chars, with character counter. Placeholder: "Describe the work you need to do — your HOD reads this to decide."

Below the form: a small note in body-sm muted-foreground "Your HOD (Prof. Okonkwo) will review this request."

**Primary button**: "Submit request" (full-width on mobile, contained on desktop).

**Generate the following states**:

1. **Empty form** (default).
2. **Validation error** — description too short, inline error "Description must be at least 50 characters. (currently 12)" below the textarea.
3. **Submitting** — button skeleton "Submitting...", disabled.
4. **Submitted (pending HOD)** — form replaced by a confirmation card: amber-soft tint, heading "Request submitted", body "Pending review by Prof. Okonkwo. You'll receive an email when a decision is made." Below: a summary of what was submitted (key, date, activity). Primary "Done" link to `/me`, secondary "Submit another" link to a fresh form.
5. **Approved** (read-only view of an approved historical request, accessed via `/me/history`) — green-soft tint card, heading "Approved by Prof. Okonkwo", subhead "A code will be issued on Saturday 10 May." Note from HOD if any.
6. **Declined** — red-soft tint card, heading "Declined by Prof. Okonkwo", subhead "Reason: 'Building closed for maintenance.'" Primary "Submit a new request" button.

Generate at 390px (mobile, primary) and 1440px (desktop).
