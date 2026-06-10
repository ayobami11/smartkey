import type { RiskTier } from './types';

// Tier boundaries — configurable via env vars so the CSO can tune them
// without a code deploy. Weights are summed across all active rules.
export type TierConfig = {
  mediumMin: number; // inclusive lower bound for MEDIUM
  highMin: number; // inclusive lower bound for HIGH
};

export const getTierConfig = (): TierConfig => {
  const medium = parseInt(process.env.RISK_TIER_MEDIUM_MIN ?? '4', 10);
  const high = parseInt(process.env.RISK_TIER_HIGH_MIN ?? '7', 10);
  return { mediumMin: medium, highMin: high };
};

export const weightToTier = (
  totalWeight: number,
  config: TierConfig
): RiskTier => {
  if (totalWeight >= config.highMin) return 'HIGH';
  if (totalWeight >= config.mediumMin) return 'MEDIUM';
  return 'LOW';
};
