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
