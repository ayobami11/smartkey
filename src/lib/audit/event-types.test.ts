import { describe, expect, it } from 'vitest';

import {
  EVENT_TYPE_FALLBACK,
  EVENT_TYPE_LABELS,
  EVENT_TYPE_MAP,
  getEventType,
  type AuditEventType,
} from '@/lib/audit/event-types';

describe('getEventType', () => {
  it.each([
    ['REQUEST_CREATED', 'REQUEST'],
    ['HOD_APPROVED', 'REQUEST'],
    ['KEY_ISSUED', 'ISSUE'],
    ['KEY_RETURNED', 'RETURN'],
    ['KEY_OVERDUE', 'ANOMALY'],
    ['HANDOVER_KEY_ACKNOWLEDGED', 'HANDOVER'],
    ['LOGIN_SUCCEEDED', 'LOGIN'],
    ['USER_PROVISIONED', 'SETTINGS'],
    ['SIGNATURE_MISMATCH', 'SIGNATURE'],
    ['SIGNATURE_REFERENCE_UPDATED', 'SIGNATURE'],
    ['SIGNATURE_REFERENCE_DECLINED', 'SIGNATURE'],
  ] as const)('maps %s to %s', (event, type) => {
    expect(getEventType(event)).toBe(type);
  });

  it('falls back to SETTINGS for an unrecognised event name', () => {
    expect(getEventType('SOME_FUTURE_EVENT')).toBe(EVENT_TYPE_FALLBACK);
  });

  it('falls back to SETTINGS for undefined', () => {
    expect(getEventType(undefined)).toBe(EVENT_TYPE_FALLBACK);
  });

  it('falls back to SETTINGS for an empty string', () => {
    expect(getEventType('')).toBe(EVENT_TYPE_FALLBACK);
  });
});

describe('EVENT_TYPE_LABELS', () => {
  it('has a label for every AuditEventType and for every value in EVENT_TYPE_MAP', () => {
    // Every type value that EVENT_TYPE_MAP or the fallback can actually
    // produce must have a matching label — a missing entry would render as
    // "undefined" in the CSO audit table filter and the events chart.
    const producedTypes = new Set<AuditEventType>([
      ...Object.values(EVENT_TYPE_MAP),
      EVENT_TYPE_FALLBACK,
    ]);
    for (const type of producedTypes) {
      expect(EVENT_TYPE_LABELS[type]).toEqual(expect.any(String));
      expect(EVENT_TYPE_LABELS[type].length).toBeGreaterThan(0);
    }
  });
});
