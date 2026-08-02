# SmartKey — Product Context

This document gives Claude full domain context. Keep it updated when product understanding evolves.

## What SmartKey replaces

A paper logbook at the University of Lagos Senate Building security desk, used to record key issues and returns. The current system has:

- Illegible entries written under time pressure.
- Missing or wrong timestamps.
- No enforced return deadline (keys borrowed indefinitely).
- No real-time check on whether a collector is currently authorised.
- No detection of keys collected outside permitted hours.
- Slow incident investigations because records are physical and not searchable.
- Dean (HOD) authorisations sent as paper memos minuted by the CSO.

## What SmartKey provides

- Role-specific dashboards for CSO, Dean (HOD), Verifier, Requester.
- Immutable digital audit trail.
- Three AI components: rule-based risk scoring, Gemini-generated shift reports, pixel-level signature verification.
- Real-time updates via Supabase Realtime.
- Email-OTP MFA, full WCAG 2.2 AA accessibility.

## Roles in detail

### Chief Security Officer (CSO)

Senior administrator. Desktop-primary. One per institution.

**Goals**: see key counts per zone in real time; review anomaly alerts; generate and download shift reports; manage user accounts; investigate incidents quickly.

**Routes**: /cso, /cso/reports, /cso/audit, /cso/users, /cso/keys, /cso/settings.

### Dean (system role: DEAN)

Faculty Dean, mixed device usage. One per faculty (2 pilot faculties at launch, scaling). The Administration group's keys are authorised by the CSO (no Dean exists for it).

**Goals**: whitelist up to three authorised collectors per faculty key; approve weekend access requests; upload signature and stamp on first sign-in; track faculty activity.

**Routes**: /hod, /hod/keys/:keyId, /hod/weekend-requests, /hod/onboarding, /hod/profile.

### Security Personnel (Verifier)

Two officers per shift, 24/7 in 8-hour shifts. Shared desktop at the security desk; phone fallback.

**Goals**: issue and receive keys quickly; see pending requests as they arrive; acknowledge outstanding keys at shift handover; log incidents.

**Routes**: /verifier, /verifier/issue, /verifier/return, /verifier/handover, /verifier/incidents.

### Requester (university staff)

Departmental staff, primary device a phone. Lowest visit frequency, lowest tolerance for friction.

**Goals**: see authorised keys; request a key; receive a 6-digit code by email; present the code at the desk; acknowledge return.

**Routes**: /me, /me/request/:keyId, /me/request/:requestId/code, /me/history, /me/profile.

## Operational rules

- **Operational hours**: configurable per zone (default 06:00–22:00 weekday, closed weekend). Out-of-hours requests raise risk.
- **Return SLA**: end of business day (17:00 default), configurable in CSO settings.
- **Code expiry**: 10 minutes from generation. Expired code → request a new one (no auto-renew).
- **Authorisation slots**: 3 per key, set by the Dean (for faculty keys) or CSO (for Administration keys).
- **Weekend access**: separate flow. Dean/CSO-signed approval; code generated for the requested date; expires 24h after the date passes.
- **Account onboarding**: CSO provisions; user activates via emailed link with 24h validity, then sets password and completes email-OTP. Deans are then forced into signature/stamp onboarding.

## Success criteria

| Criterion                                | Target                                   |
| ---------------------------------------- | ---------------------------------------- |
| Processing time reduction (UAT vs paper) | 80–90%                                   |
| Audit-log accuracy                       | Zero missing or malformed entries        |
| Operational uptime                       | 99.5%                                    |
| Performance                              | LCP ≤ 2.5s · CLS < 0.1 · Lighthouse ≥ 85 |
| Accessibility                            | WCAG 2.2 AA across every flow            |

## Scale at launch

- 5 departments
- Up to 50 keys per zone (2 zones: New Senate, Old Senate)
- All keys collected every weekday
- Approximately 100–500 staff requesters
