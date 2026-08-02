import { getTierConfig } from './thresholds';
import type { RiskEngineConfig } from './types';

// Fallback used when the risk_rule_config / risk_tier_config tables can't be
// read (transient DB error) or haven't been seeded. Values match the engine's
// original hardcoded defaults, so a fallback never silently changes scoring
// behaviour from what shipped before these tables existed. The tier half
// reuses getTierConfig() so an emergency env-var override still works even if
// the DB read is unavailable.
export const DEFAULT_RISK_CONFIG: RiskEngineConfig = {
  rules: {
    outside_operational_hours: { weight: 3, enabled: true },
    outstanding_key_not_returned: { weight: 5, enabled: true },
    weekend_without_memo: { weight: 4, enabled: true },
    excess_request_frequency: { weight: 2, enabled: true },
    collector_not_whitelisted: { weight: 5, enabled: true },
  },
  tier: getTierConfig(),
};
