import type { TierConfig } from './thresholds';

export type RiskTier = 'LOW' | 'MEDIUM' | 'HIGH';

export type RiskFactor = {
  rule: string;
  description: string;
  weight: number;
};

// Canonical rule identifiers — must match the `rule` string each function in
// rules.ts returns, and the risk_rule_key Postgres enum.
export type RiskRuleKey =
  | 'outside_operational_hours'
  | 'outstanding_key_not_returned'
  | 'weekend_without_memo'
  | 'excess_request_frequency'
  | 'collector_not_whitelisted';

// CSO-editable engine configuration, sourced from risk_rule_config /
// risk_tier_config. Only weight/enabled are configurable per rule — the
// per-rule env tunables (e.g. OPERATING_HOURS_START/END) stay env-only.
export type RiskEngineConfig = {
  rules: Record<RiskRuleKey, { weight: number; enabled: boolean }>;
  tier: TierConfig;
};

// Pre-fetched context passed to the engine — no DB calls inside the engine.
export type RiskContext = {
  requestType: 'WEEKDAY' | 'WEEKEND';
  requestedAt: Date;
  keyZone: 'NEW_SENATE' | 'OLD_SENATE';
  hasOutstandingKey: boolean;
  // True when every key the requester is currently holding is one they are
  // still authorised for. A whitelisted bulk collector (e.g. a porter holding
  // several keys they each have a slot on) is expected, not a risk.
  outstandingKeysAuthorised: boolean;
  recentRequestCount: number; // count in the last 24 h
  isWhitelisted: boolean;
};

export type RiskResult = {
  tier: RiskTier;
  factors: RiskFactor[];
  totalWeight: number;
};
