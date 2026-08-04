import { z } from 'zod';

import type { ReportCounts, ReportEvent, TimelineEntry } from './types';

const timelineEntrySchema = z.object({
  time: z.string(),
  event: z.string(),
  description: z.string(),
});

const geminiOutputSchema = z.object({
  markdown: z.string().min(1),
  timeline: z.array(timelineEntrySchema).default([]),
});

// Parse Gemini's response into { markdown, timeline }. Strips markdown code
// fences before parsing since Gemini often wraps JSON in ```json blocks even
// when asked not to. Returns null on any failure so the caller falls back to
// the template report.
export const parseGeminiOutput = (
  rawText: string
): { markdown: string; timeline: TimelineEntry[] } | null => {
  const stripped = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  let json: unknown;
  try {
    json = JSON.parse(stripped);
  } catch {
    return null;
  }

  const result = geminiOutputSchema.safeParse(json);
  if (!result.success) return null;

  return { markdown: result.data.markdown, timeline: result.data.timeline };
};

// Derive the summary counts shown on the reports list card from the shift's
// audit events. Without this the list cards always render zero, because the RPC
// only stores a placeholder metadata object.
export const computeMetadataCounts = (events: ReportEvent[]): ReportCounts => {
  let issued = 0;
  let returned = 0;
  let flagged = 0;

  for (const e of events) {
    if (e.event === 'KEY_ISSUED') issued += 1;
    if (e.event === 'KEY_RETURNED' || e.event === 'KEY_RETURNED_UNVERIFIED')
      returned += 1;

    const riskTier =
      e.payload && typeof e.payload === 'object'
        ? (e.payload as Record<string, unknown>).risk_tier
        : undefined;
    const isFlagged =
      riskTier === 'HIGH' ||
      e.event === 'KEY_RETURNED_UNVERIFIED' ||
      e.event === 'KEY_OVERDUE' ||
      e.event.includes('INCIDENT') ||
      e.event.includes('SUSPICIOUS');
    if (isFlagged) flagged += 1;
  }

  return {
    issued_count: issued,
    returned_count: returned,
    flagged_count: flagged,
  };
};
