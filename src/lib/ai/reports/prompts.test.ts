import { describe, expect, it } from 'vitest';

import { buildReportPrompt, buildTemplateReport } from './prompts';
import type { ReportEvent } from './types';

const events: ReportEvent[] = [
  {
    event: 'KEY_ISSUED',
    actor_role: 'VERIFIER',
    target_type: 'request',
    target_id: '00000000-0000-0000-0000-000000000000',
    payload: { key_code: 'NS-304' },
    occurred_at: '2026-06-16T08:00:00Z',
  },
];

describe('buildReportPrompt', () => {
  it('includes all five required report sections', () => {
    const prompt = buildReportPrompt(events);
    expect(prompt).toContain('summary');
    expect(prompt).toContain('## Outstanding Keys');
    expect(prompt).toContain('## Flagged Events');
    expect(prompt).toContain('## Unresolved Incidents');
    expect(prompt).toContain('## Chain of Custody');
  });

  it('asks for the JSON markdown + timeline contract', () => {
    const prompt = buildReportPrompt(events);
    expect(prompt).toContain('"markdown"');
    expect(prompt).toContain('"timeline"');
  });

  it('embeds the audit events', () => {
    expect(buildReportPrompt(events)).toContain('NS-304');
  });
});

describe('buildTemplateReport', () => {
  it('produces markdown with the template-fallback footer', () => {
    const { markdown, timeline } = buildTemplateReport('shift-123', events);
    expect(markdown).toContain('shift-123');
    expect(markdown).toContain('template fallback');
    expect(timeline).toEqual([]);
  });

  it('reports the event count', () => {
    const { markdown } = buildTemplateReport('shift-123', events);
    expect(markdown).toContain('1 audit event');
  });
});
