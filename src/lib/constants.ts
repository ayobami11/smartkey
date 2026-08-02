/**
 * Central constants for SmartKey.
 *
 * Every enum value, status string, and display label used across the app
 * originates here. Import from this file instead of redeclaring literals
 * inline — a single change here propagates everywhere.
 *
 * Colour / Tailwind classes live here only when used in two or more files.
 * Component-specific display configs (e.g. icon + colour combos) stay in
 * the component that owns them.
 */

// ---------------------------------------------------------------------------
// User roles
// ---------------------------------------------------------------------------

export const USER_ROLES = ['CSO', 'DEAN', 'VERIFIER', 'REQUESTER'] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  CSO: 'CSO',
  DEAN: 'Dean',
  VERIFIER: 'Verifier',
  REQUESTER: 'Requester',
};

/** Tailwind badge classes for role pills. */
export const ROLE_CLASSES: Record<UserRole, string> = {
  CSO: 'bg-primary/10 text-primary',
  DEAN: 'bg-amber-100 text-amber-700',
  VERIFIER: 'bg-blue-100 text-blue-700',
  REQUESTER: 'bg-teal-100 text-teal-700',
};

// ---------------------------------------------------------------------------
// User statuses
// ---------------------------------------------------------------------------

export const USER_STATUSES = [
  'ACTIVE',
  'PENDING_ACTIVATION',
  'DEACTIVATED',
] as const;

export type UserStatus = (typeof USER_STATUSES)[number];

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: 'Active',
  PENDING_ACTIVATION: 'Pending activation',
  DEACTIVATED: 'Deactivated',
};

/** Tailwind badge classes for the external/guest pill — shared across all badge sites. */
export const GUEST_BADGE_CLASSES =
  'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-200';

/** Tailwind badge classes for user status pills. */
export const USER_STATUS_CLASSES: Record<UserStatus, string> = {
  ACTIVE:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  PENDING_ACTIVATION: 'bg-sky-100 text-sky-700',
  DEACTIVATED: 'bg-muted text-muted-foreground',
};

// ---------------------------------------------------------------------------
// Request statuses
// ---------------------------------------------------------------------------

export const REQUEST_STATUSES = [
  'PENDING_HOD',
  'APPROVED',
  'CODE_ISSUED',
  'KEY_ISSUED',
  'KEY_RETURNED',
  'EXPIRED',
  'CANCELLED',
  'DECLINED',
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

export const REQUEST_TYPES = ['WEEKDAY', 'WEEKEND'] as const;

export type RequestType = (typeof REQUEST_TYPES)[number];

// ---------------------------------------------------------------------------
// Key statuses
// ---------------------------------------------------------------------------

export const KEY_STATUSES = [
  'AVAILABLE',
  'ISSUED',
  'OVERDUE',
  'RETIRED',
] as const;

export type KeyStatus = (typeof KEY_STATUSES)[number];

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

export const ZONES = ['NEW_SENATE', 'OLD_SENATE'] as const;

export type Zone = (typeof ZONES)[number];

export const ZONE_LABELS: Record<Zone, string> = {
  NEW_SENATE: 'New Senate',
  OLD_SENATE: 'Old Senate',
};

// ---------------------------------------------------------------------------
// Incident types
// ---------------------------------------------------------------------------

export const INCIDENT_TYPES = [
  { value: 'MISSING_KEY', label: 'Missing key' },
  { value: 'SUSPICIOUS_ACTIVITY', label: 'Suspicious activity' },
  { value: 'EQUIPMENT_FAULT', label: 'Equipment fault' },
  { value: 'PROCEDURAL', label: 'Procedural' },
  { value: 'OTHER', label: 'Other' },
] as const;

export type IncidentType = (typeof INCIDENT_TYPES)[number]['value'];

export const INCIDENT_TYPE_LABELS: Record<IncidentType, string> =
  Object.fromEntries(
    INCIDENT_TYPES.map(({ value, label }) => [value, label])
  ) as Record<IncidentType, string>;

// ---------------------------------------------------------------------------
// Incident severities
// ---------------------------------------------------------------------------

export const INCIDENT_SEVERITIES = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
] as const;

export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number]['value'];

export const INCIDENT_SEVERITY_LABELS: Record<IncidentSeverity, string> =
  Object.fromEntries(
    INCIDENT_SEVERITIES.map(({ value, label }) => [value, label])
  ) as Record<IncidentSeverity, string>;

/** Tailwind badge classes for incident severity pills. */
export const INCIDENT_SEVERITY_CLASSES: Record<IncidentSeverity, string> = {
  LOW: 'bg-muted text-muted-foreground',
  MEDIUM: 'bg-orange-100 text-orange-700',
  HIGH: 'bg-destructive/10 text-destructive',
};

// ---------------------------------------------------------------------------
// Incident statuses
// ---------------------------------------------------------------------------

export const INCIDENT_STATUSES = ['OPEN', 'RESOLVED', 'ESCALATED'] as const;

export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

// ---------------------------------------------------------------------------
// Risk tiers
// Re-exported from src/lib/ai/risk/types.ts so callers have one import path.
// ---------------------------------------------------------------------------

export type { RiskTier } from '@/lib/ai/risk/types';

// ---------------------------------------------------------------------------
// HOD decisions
// ---------------------------------------------------------------------------

export const HOD_DECISIONS = ['APPROVED', 'DECLINED'] as const;

export type HodDecision = (typeof HOD_DECISIONS)[number];

// ---------------------------------------------------------------------------
// Department authoriser types
// ---------------------------------------------------------------------------

export const AUTHORISER_TYPES = ['DEAN', 'CSO'] as const;

export type AuthoriserType = (typeof AUTHORISER_TYPES)[number];

// ---------------------------------------------------------------------------
// Audit event names
//
// Every event written to audit_log.event must appear in this list.
// Keep this in sync with the RPCs in supabase/migrations/ and the
// writeAuditEntry callers in src/app/api/.
// ---------------------------------------------------------------------------

export const AUDIT_EVENTS = [
  'LOGIN_SUCCEEDED',
  'REQUEST_CREATED',
  'REQUEST_CANCELLED',
  'REQUEST_EXPIRED',
  'CODE_ISSUED',
  'REQUEST_APPROVED_CSO',
  'REQUEST_DECLINED_CSO',
  'HOD_APPROVED',
  'HOD_DECLINED',
  'KEY_ISSUED',
  'KEY_RETURNED',
  'KEY_RETURNED_UNVERIFIED',
  'KEY_OVERDUE',
  'RETURN_CODE_GENERATED',
  'HANDOVER_KEY_ACKNOWLEDGED',
  'USER_PROVISIONED',
  'USER_DEACTIVATED',
  'USER_UPDATED',
  'PASSWORD_CHANGED',
  'SIGNATURE_MISMATCH',
  'SHIFT_REPORT_INITIATED',
  'REPORT_COMMENT_ADDED',
  'RISK_CONFIG_UPDATED',
] as const;

export type AuditEvent = (typeof AUDIT_EVENTS)[number];
