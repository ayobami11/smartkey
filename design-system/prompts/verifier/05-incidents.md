# Verifier Incident Log

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/verifier/incidents`** screen — a single-column form, not a list+create pair. Incident history browsing lives on the CSO's audit screen, not here.

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

## Responsive breakpoints

- xs ≤ 480px (phone)
- sm 481–768px (large phone, small tablet)
- md 769–1024px (tablet, small laptop)
- lg 1025–1440px (standard desktop)
- xl > 1440px (wide desktop)

Generate the screen at xs (mobile) and lg (desktop) at minimum. Touch targets minimum 44×44px.

---

## Generation request

Generate the incident-logging screen (`/verifier/incidents`). This is a **single-column card form**, not a list-plus-create-dialog pair — the shipped screen is just the form itself, centred in a max-width container.

**Fields, in order**:

1. **Incident type** (select): Missing key / Suspicious activity / Equipment fault / Procedural / Other — each option shows a short hint subtext both in the trigger and in the dropdown item.
2. **Severity** (select): Low / Medium / High, each with a hint subtext.
3. **High-severity warning banner** — conditional, shown only when Severity = High: a destructive-tinted banner with an alert-triangle icon: "High severity incidents alert the CSO immediately."
4. **Description** (textarea, 6 rows) — helper text below: "Be specific. This entry is immutable once submitted."

Primary "Log incident" button, full-width.

**Success state**: emerald panel, the generated incident reference shown in monospace/uppercase (e.g. "INC-2026-0042"), heading "Incident recorded." The body message differs by severity: for High, "The CSO has been notified immediately."; for Low/Medium, "…appended to the audit log." A "Log another incident" link resets the form to blank.

Generate: the empty form, the High-severity variant with its warning banner visible, and the success state. At 1440px (desktop) and 390px (mobile).
