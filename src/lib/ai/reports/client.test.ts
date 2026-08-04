import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateShiftReport } from './client';
import type { ReportEvent } from './types';

// Hoisted so the vi.mock factory below (which is itself hoisted above the
// imports) can close over the same fn instances the tests assert on.
const mocks = vi.hoisted(() => {
  const generateContent = vi.fn();
  return {
    generateContent,
    getGenerativeModel: vi.fn(() => ({ generateContent })),
  };
});

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn(() => ({
    getGenerativeModel: mocks.getGenerativeModel,
  })),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const events: ReportEvent[] = [
  {
    event: 'KEY_ISSUED',
    actor_role: 'VERIFIER',
    target_type: 'request',
    target_id: '00000000-0000-0000-0000-000000000000',
    payload: { key_code: 'NS-304' },
    occurred_at: '2026-06-16T08:00:00Z',
  },
  {
    event: 'KEY_RETURNED',
    actor_role: 'VERIFIER',
    target_type: 'request',
    target_id: '00000000-0000-0000-0000-000000000001',
    payload: null,
    occurred_at: '2026-06-16T09:00:00Z',
  },
  {
    event: 'KEY_OVERDUE',
    actor_role: 'CSO',
    target_type: 'key',
    target_id: '00000000-0000-0000-0000-000000000002',
    payload: null,
    occurred_at: '2026-06-16T10:00:00Z',
  },
];

const geminiResponse = (text: string) => ({ response: { text: () => text } });

const validOutput = JSON.stringify({
  markdown: '## Summary\nAll quiet.',
  timeline: [{ time: '08:00', event: 'KEY_ISSUED', description: 'NS-304' }],
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('generateShiftReport provenance', () => {
  it('records the gemini path with the model id on success', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    // Empty string counts as unset, so this is the default-model case.
    vi.stubEnv('GEMINI_MODEL', '');
    mocks.generateContent.mockResolvedValue(geminiResponse(validOutput));

    const report = await generateShiftReport('shift-123', events);

    expect(report.metadata.source).toBe('gemini');
    expect(report.metadata.model).toBe('gemini-3.5-flash');
    expect(report.metadata.fallback_reason).toBeNull();
    expect(report.markdown).toContain('All quiet.');
    expect(report.timeline).toHaveLength(1);
  });

  it('records the GEMINI_MODEL override as the model that produced the report', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    vi.stubEnv('GEMINI_MODEL', 'gemini-9.9-pro');
    mocks.generateContent.mockResolvedValue(geminiResponse(validOutput));

    const report = await generateShiftReport('shift-123', events);

    expect(report.metadata.source).toBe('gemini');
    expect(report.metadata.model).toBe('gemini-9.9-pro');
    expect(mocks.getGenerativeModel).toHaveBeenCalledWith({
      model: 'gemini-9.9-pro',
    });
  });

  it('records no_api_key with a null model when GEMINI_API_KEY is unset', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');

    const report = await generateShiftReport('shift-123', events);

    expect(report.metadata.source).toBe('template');
    expect(report.metadata.fallback_reason).toBe('no_api_key');
    // No call was attempted, so there is no model to attribute.
    expect(report.metadata.model).toBeNull();
    expect(mocks.generateContent).not.toHaveBeenCalled();
    expect(report.markdown).toContain('template fallback');
  });

  it('records sdk_error with the attempted model when the SDK call throws', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    vi.stubEnv('GEMINI_MODEL', 'gemini-3.5-flash');
    mocks.generateContent.mockRejectedValue(new Error('429 quota exceeded'));

    const report = await generateShiftReport('shift-123', events);

    expect(report.metadata.source).toBe('template');
    expect(report.metadata.fallback_reason).toBe('sdk_error');
    expect(report.metadata.model).toBe('gemini-3.5-flash');
    expect(report.markdown).toContain('template fallback');
  });

  it('records unparseable_output when Gemini answers but fails the parser', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    vi.stubEnv('GEMINI_MODEL', 'gemini-3.5-flash');
    mocks.generateContent.mockResolvedValue(
      geminiResponse('sorry, I cannot help with that')
    );

    const report = await generateShiftReport('shift-123', events);

    expect(report.metadata.source).toBe('template');
    expect(report.metadata.fallback_reason).toBe('unparseable_output');
    expect(report.metadata.model).toBe('gemini-3.5-flash');
  });
});

describe('generateShiftReport metadata counts', () => {
  const expectedCounts = {
    issued_count: 1,
    returned_count: 1,
    // KEY_OVERDUE is the only flagged event in the fixture.
    flagged_count: 1,
  };

  it('derives counts locally on the gemini path', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    mocks.generateContent.mockResolvedValue(geminiResponse(validOutput));

    const report = await generateShiftReport('shift-123', events);

    expect(report.metadata).toMatchObject(expectedCounts);
  });

  it('derives the same counts on every fallback path', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const noKey = await generateShiftReport('shift-123', events);

    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    mocks.generateContent.mockRejectedValue(new Error('boom'));
    const sdkError = await generateShiftReport('shift-123', events);

    mocks.generateContent.mockResolvedValue(geminiResponse('not json'));
    const unparseable = await generateShiftReport('shift-123', events);

    for (const report of [noKey, sdkError, unparseable]) {
      expect(report.metadata).toMatchObject(expectedCounts);
    }
  });

  it('still stamps generated_at on both paths', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const template = await generateShiftReport('shift-123', events);

    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    mocks.generateContent.mockResolvedValue(geminiResponse(validOutput));
    const gemini = await generateShiftReport('shift-123', events);

    expect(Number.isNaN(Date.parse(template.metadata.generated_at))).toBe(
      false
    );
    expect(Number.isNaN(Date.parse(gemini.metadata.generated_at))).toBe(false);
  });
});
