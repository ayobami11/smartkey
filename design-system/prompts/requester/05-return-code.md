# Requester Return-Code Sheet

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **return-code sheet**, opened from the "Return" button on an outstanding-key row in `/requester/dashboard`. **This screen did not exist in the original prompt set at all.**

---

## Project Context

SmartKey is a four-role web application replacing the paper-based key management workflow at the University of Lagos Senate Building. The roles are:

- **Chief Security Officer (CSO)**: senior administrator. Desktop-primary. Oversight, reports, audit log, user management.
- **Dean** (system role `DEAN`): faculty member. Mixed device usage. Authorises up to three collectors per unit key, signs weekend approvals. The Administration unit's keys are authorised by the CSO instead — no Dean exists for it.
- **Verifier (security personnel)**: 24/7 desk staff in 8-hour shifts. Shared desktop at the security desk. Issues and receives keys, performs shift handover.
- **Requester (university staff)**: lowest-frequency user. Phone-primary. Requests a key, receives a 6-digit code by email, presents it at the desk.

Three AI components run in the background: rule-based risk scoring (visible to verifiers as Low/Medium/High tier), Gemini-generated shift reports (CSO dashboard), and pixel-level signature verification (Dean-signed approvals). WCAG 2.2 AA conformance is the floor. Use the SmartKey design system from DESIGN.md — do not invent colours, typography, or component styling.

Grouping term: SmartKey organises keys by **Unit** (not "Department" or "Faculty").

## Requester area routes

- `/requester/dashboard` — Dashboard home: active collection-code banner, outstanding keys, authorised keys grid, weekend requests panel
- `/requester/request/:requestId/code` — Active collection-code display with countdown
- `/requester/history` — Personal history of past requests
- `/requester/settings` — Account (incl. photo), notifications

## Flow: Receive a returned key (context — this is the requester's half of the verifier's return flow)

The requester generates a 6-digit return code from their own dashboard (15-minute expiry) and reads it aloud to the verifier at the desk, who enters it to confirm the return. This exists so the verifier's default return path has something to check against — see `verifier/03-receive-key.md` for the verifier side, including its unverified/override fallback when the requester can't produce a code.

## Responsive breakpoints

- xs ≤ 480px (phone)
- sm 481–768px (large phone, small tablet)
- md 769–1024px (tablet, small laptop)
- lg 1025–1440px (standard desktop)
- xl > 1440px (wide desktop)

Generate the screen at xs (mobile) and lg (desktop) at minimum. Touch targets minimum 44×44px.

---

## Generation request

Generate the return-code sheet, opened via the "Return" button on an outstanding-key row on the requester dashboard. Slides in from the right on desktop, from the bottom on mobile. This sheet has a five-state phase machine — generate all five.

**Context card at top** (present throughout): key code, room name.

**State 1 — idle**: a single "Generate code" button, full-width.

**State 2 — generating**: the button shows a busy/disabled state.

**State 3 — code_active**: a card labelled "Your return code" — a live mm:ss countdown paired with a linear progress bar (15-minute lifetime), the giant 6-digit code in JetBrains Mono, and an instruction line: "Read this to the security officer when you hand back the key." The countdown auto-transitions to State 4 at 0.

**State 4 — expired**: an X-circle icon, "Code expired," a "Generate new code" button (returns to State 2).

**State 5 — returned**: triggered by a realtime update once the verifier confirms the return — key icon (emerald), "Key returned," code/room, and a "Close" button.

**State — error**: destructive message with a "Try again" button, for a failed generate call.

Use placeholder key NS-304, Senate Room 304, code "739104". Generate all states at 390px (mobile, primary) and 1440px (desktop).
