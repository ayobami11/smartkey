import {
  collectorNotWhitelisted,
  excessRequestFrequency,
  outstandingKeyNotReturned,
  outsideOperationalHours,
  weekendWithoutMemo,
} from './rules';
import { getTierConfig, weightToTier } from './thresholds';
import type { RiskContext, RiskResult } from './types';

export const evaluateRisk = (context: RiskContext): RiskResult => {
  const config = getTierConfig();

  const candidates = [
    outsideOperationalHours(context),
    outstandingKeyNotReturned(context),
    weekendWithoutMemo(context),
    excessRequestFrequency(context),
    collectorNotWhitelisted(context),
  ];

  const factors = candidates.filter((f) => f !== null);
  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const tier = weightToTier(totalWeight, config);

  return { tier, factors, totalWeight };
};
