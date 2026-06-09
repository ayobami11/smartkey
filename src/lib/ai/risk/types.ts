export type RiskTier = 'LOW' | 'MEDIUM' | 'HIGH';

export type RiskFactor = {
  rule: string;
  description: string;
  weight: number;
};

// Pre-fetched context passed to the engine — no DB calls inside the engine.
export type RiskContext = {
  requestType: 'WEEKDAY' | 'WEEKEND';
  requestedAt: Date;
  keyZone: 'NEW_SENATE' | 'OLD_SENATE';
  hasOutstandingKey: boolean;
  recentRequestCount: number; // count in the last 24 h
  isWhitelisted: boolean;
};

export type RiskResult = {
  tier: RiskTier;
  factors: RiskFactor[];
  totalWeight: number;
};
