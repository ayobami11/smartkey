import type { RiskContext, RiskFactor } from './types';

// Each rule returns a RiskFactor if it fires, or null if it does not.

const parseHHMM = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export const outsideOperationalHours = (
  context: RiskContext,
  opts?: { start?: string; end?: string; weight?: number }
): RiskFactor | null => {
  const weight = opts?.weight ?? 3;
  const startMin = parseHHMM(
    opts?.start ?? process.env.OPERATING_HOURS_START ?? '07:00'
  );
  const endMin = parseHHMM(
    opts?.end ?? process.env.OPERATING_HOURS_END ?? '18:00'
  );

  const day = context.requestedAt.getDay(); // 0=Sun, 6=Sat
  const isWeekend = day === 0 || day === 6;
  const minuteOfDay =
    context.requestedAt.getHours() * 60 + context.requestedAt.getMinutes();
  const isOutsideHours =
    minuteOfDay < startMin || minuteOfDay >= endMin || isWeekend;

  if (!isOutsideHours) return null;

  const reason = isWeekend
    ? 'Request submitted on a weekend outside normal operating days'
    : `Request submitted outside operational hours (${opts?.start ?? process.env.OPERATING_HOURS_START ?? '07:00'}–${opts?.end ?? process.env.OPERATING_HOURS_END ?? '18:00'})`;

  return { rule: 'outside_operational_hours', description: reason, weight };
};

export const outstandingKeyNotReturned = (
  context: RiskContext,
  opts?: { weight?: number }
): RiskFactor | null => {
  const weight = opts?.weight ?? 5;
  if (!context.hasOutstandingKey) return null;
  return {
    rule: 'outstanding_key_not_returned',
    description: 'Requester has a key that has not yet been returned',
    weight,
  };
};

export const weekendWithoutMemo = (
  context: RiskContext,
  opts?: { weight?: number }
): RiskFactor | null => {
  const weight = opts?.weight ?? 4;
  if (context.requestType !== 'WEEKEND') return null;
  return {
    rule: 'weekend_without_memo',
    description: 'Weekend access requested — requires HOD memo approval',
    weight,
  };
};

export const excessRequestFrequency = (
  context: RiskContext,
  opts?: { maxDailyRequests?: number; weight?: number }
): RiskFactor | null => {
  const weight = opts?.weight ?? 2;
  const threshold =
    opts?.maxDailyRequests ??
    parseInt(process.env.RISK_MAX_DAILY_REQUESTS ?? '5', 10);
  if (context.recentRequestCount <= threshold) return null;
  return {
    rule: 'excess_request_frequency',
    description: `Requester has made ${context.recentRequestCount} requests in the last 24 hours (threshold: ${threshold})`,
    weight,
  };
};

export const collectorNotWhitelisted = (
  context: RiskContext,
  opts?: { weight?: number }
): RiskFactor | null => {
  const weight = opts?.weight ?? 5;
  if (context.isWhitelisted) return null;
  return {
    rule: 'collector_not_whitelisted',
    description: 'Requester is not authorised for this key',
    weight,
  };
};
