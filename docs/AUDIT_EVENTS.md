# Audit events

This is the complete catalogue of audit log event names and payload shapes. Source of truth: `src/lib/audit/events.ts` (zod schemas).

| Event                          | Actor role | Payload key fields                                                      |
| ------------------------------ | ---------- | ----------------------------------------------------------------------- |
| `account_provisioned`          | CSO        | new_user_id, email, role                                                |
| `account_activated`            | (any)      | user_id                                                                 |
| `account_deactivated`          | CSO        | user_id, reason                                                         |
| `login_success`                | (any)      | session_id                                                              |
| `login_failure`                | —          | email, reason                                                           |
| `mfa_challenge_sent`           | (any)      | user_id                                                                 |
| `mfa_verified`                 | (any)      | user_id                                                                 |
| `password_reset_requested`     | (any)      | email                                                                   |
| `password_reset_completed`     | (any)      | user_id                                                                 |
| `request_created`              | REQUESTER  | request_id, key_id, type, risk_tier, risk_factors                       |
| `code_generated`               | system     | request_id, code (hashed), expires_at                                   |
| `code_expired`                 | system     | request_id                                                              |
| `code_refreshed`               | REQUESTER  | request_id                                                              |
| `request_cancelled`            | REQUESTER  | request_id, reason                                                      |
| `key_issued`                   | VERIFIER   | request_id, key_id, collector_id, risk_tier, acknowledged_high_risk     |
| `key_returned`                 | VERIFIER   | request_id, key_id, returner_id (if not the original collector)         |
| `key_overdue_flagged`          | system     | request_id, key_id, hours_past                                          |
| `weekend_request_submitted`    | REQUESTER  | request_id, key_id, weekend_date                                        |
| `HOD_APPROVED`                 | DEAN / CSO | decision_id, signature_verified, signature_mismatch_pct, note, override |
| `HOD_DECLINED`                 | DEAN / CSO | decision_id, note, override                                             |
| `SIGNATURE_MISMATCH`           | DEAN       | ref_url, submitted_url, mismatch_pct, threshold_pct                     |
| `SIGNATURE_REFERENCE_UPDATED`  | DEAN / CSO | type, new_url, replaced_existing, resolved_by_cso, mismatch_pct, note   |
| `SIGNATURE_REFERENCE_DECLINED` | CSO        | type, pending_url, note                                                 |
| `collector_authorised`         | DEAN       | key_id, collector_id                                                    |
| `collector_replaced`           | DEAN       | key_id, removed_collector_id, added_collector_id                        |
| `collector_removed`            | DEAN       | key_id, removed_collector_id                                            |
| `shift_started`                | VERIFIER   | shift_id, officer_id                                                    |
| `shift_handover_completed`     | VERIFIER   | outgoing_shift_id, incoming_officer_id, acknowledged_keys, bulk         |
| `incident_logged`              | VERIFIER   | incident_id, reference, type, severity                                  |
| `incident_resolved`            | (any)      | incident_id, resolution_note                                            |
| `incident_escalated`           | (any)      | incident_id, escalation_note                                            |
| `anomaly_detected`             | system     | request_id, severity, rule                                              |
| `anomaly_resolved`             | CSO        | anomaly_id, resolution_note                                             |
| `report_generated`             | system     | report_id, shift_id                                                     |
| `report_comment_added`         | CSO        | report_id, comment_id                                                   |
| `settings_changed`             | CSO        | key, old_value, new_value                                               |
| `key_created`                  | CSO        | key_id, code, zone, department_id                                       |
| `key_retired`                  | CSO        | key_id                                                                  |

When adding an event:

1. Add to `AuditEvent` union in `src/lib/audit/events.ts`.
2. Add zod schema for payload.
3. Update this table.
4. If validated server-side, update the RPC.
5. Add a unit test.
