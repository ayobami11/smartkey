import {
  collectorNotWhitelisted,
  excessRequestFrequency,
  outstandingKeyNotReturned,
  outsideOperationalHours,
  weekendWithoutMemo,
} from './rules';
import { weightToTier } from './thresholds';
import type { RiskContext, RiskEngineConfig, RiskResult } from './types';

export const evaluateRisk = (
  context: RiskContext,
  config: RiskEngineConfig
): RiskResult => {
  const candidates = [
    config.rules.outside_operational_hours.enabled
      ? outsideOperationalHours(context, {
          weight: config.rules.outside_operational_hours.weight,
        })
      : null,
    config.rules.outstanding_key_not_returned.enabled
      ? outstandingKeyNotReturned(context, {
          weight: config.rules.outstanding_key_not_returned.weight,
        })
      : null,
    config.rules.weekend_without_memo.enabled
      ? weekendWithoutMemo(context, {
          weight: config.rules.weekend_without_memo.weight,
        })
      : null,
    config.rules.excess_request_frequency.enabled
      ? excessRequestFrequency(context, {
          weight: config.rules.excess_request_frequency.weight,
        })
      : null,
    config.rules.collector_not_whitelisted.enabled
      ? collectorNotWhitelisted(context, {
          weight: config.rules.collector_not_whitelisted.weight,
        })
      : null,
  ];

  const factors = candidates.filter((f) => f !== null);
  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const tier = weightToTier(totalWeight, config.tier);

  return { tier, factors, totalWeight };
};
