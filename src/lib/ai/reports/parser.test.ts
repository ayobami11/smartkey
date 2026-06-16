import { describe, expect, it } from 'vitest';

import { computeMetadataCounts, parseGeminiOutput } from './parser';
import type { ReportEvent } from './types';

const event = (
  name: string,
  payload: Record<string, unknown> | null = null
): ReportEvent => ({
  event: name,
  actor_role: 'VERIFIER',
  target_type: 'request',
  target_id: '00000000-0000-0000-0000-000000000000',
  payload,
  occurred_at: '2026-06-16T08:00:00Z',
});

describe('parseGeminiOutput', () => {
  it('parses a valid JSON response with markdown and timeline', () => {
    const raw = JSON.stringify({
      markdown: '## Summary\nAll quiet.',
      timeline: [{ time: '08:00', event: 'KEY_ISSUED', description: 'NS-304' }],
    });
    const result = parseGeminiOutput(raw);
    expect(result).not.toBeNull();
    expect(result?.markdown).toContain('Summary');
    expect(result?.timeline).toHaveLength(1);
  });

  it('defaults timeline to an empty array when omitted', () => {
    const result = parseGeminiOutput(JSON.stringify({ markdown: '# x' }));
    expect(result?.timeline).toEqual([]);
  });

  it('returns null for non-JSON input', () => {
    expect(parseGeminiOutput('not json at all')).toBeNull();
  });

  it('returns null when markdown is missing', () => {
    expect(parseGeminiOutput(JSON.stringify({ timeline: [] }))).toBeNull();
  });

  it('returns null when timeline entries have the wrong shape', () => {
    const raw = JSON.stringify({
      markdown: '# x',
      timeline: [{ time: '08:00' }],
    });
    expect(parseGeminiOutput(raw)).toBeNull();
  });
});

describe('computeMetadataCounts', () => {
  it('counts issued, returned, and flagged events', () => {
    const events: ReportEvent[] = [
      event('KEY_ISSUED'),
      event('KEY_ISSUED'),
      event('KEY_RETURNED'),
      event('KEY_RETURNED_UNVERIFIED'),
      event('CODE_ISSUED', { risk_tier: 'HIGH' }),
    ];
    const counts = computeMetadataCounts(events);
    expect(counts.issued_count).toBe(2);
    // KEY_RETURNED + KEY_RETURNED_UNVERIFIED
    expect(counts.returned_count).toBe(2);
    // HIGH risk_tier + KEY_RETURNED_UNVERIFIED
    expect(counts.flagged_count).toBe(2);
  });

  it('returns zeros for an empty shift', () => {
    expect(computeMetadataCounts([])).toEqual({
      issued_count: 0,
      returned_count: 0,
      flagged_count: 0,
    });
  });
});
