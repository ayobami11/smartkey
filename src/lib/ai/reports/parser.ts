import { z } from 'zod';

import type { ReportEvent, TimelineEntry } from './types';

const timelineEntrySchema = z.object({
  time: z.string(),
  event: z.string(),
  description: z.string(),
});

const geminiOutputSchema = z.object({
  markdown: z.string().min(1),
  timeline: z.array(timelineEntrySchema).default([]),
});

// Parse Gemini's JSON response into { markdown, timeline }. Returns null on any
// failure (non-JSON, missing fields, wrong shape) so the caller can fall back to
// the template report rather than persisting a broken body.
export const parseGeminiOutput = (
  rawText: string
): { markdown: string; timeline: TimelineEntry[] } | null => {
  let json: unknown;
  try {
    json = JSON.parse(rawText);
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
export const computeMetadataCounts = (
  events: ReportEvent[]
): { issued_count: number; returned_count: number; flagged_count: number } => {
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
