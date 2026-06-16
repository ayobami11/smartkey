import { GoogleGenerativeAI } from '@google/generative-ai';

import { logger } from '@/lib/logger';

import { computeMetadataCounts, parseGeminiOutput } from './parser';
import { buildReportPrompt, buildTemplateReport } from './prompts';
import type { GeneratedReport, ReportEvent } from './types';

// Default to the latest stable Flash model. Overridable without a code change
// via GEMINI_MODEL (e.g. when Google ships a newer release). Server-side only —
// GEMINI_API_KEY must never be exposed to the browser.
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash';

// Generate a shift report from the shift's audit events. Calls Gemini via the
// official SDK and falls back to a deterministic template when the key is
// absent, the call throws, or the response can't be parsed — the feature always
// returns usable output. Metadata counts are derived locally either way.
export const generateShiftReport = async (
  shiftId: string,
  events: ReportEvent[]
): Promise<GeneratedReport> => {
  const counts = computeMetadataCounts(events);
  const generatedAt = new Date().toISOString();
  const apiKey = process.env.GEMINI_API_KEY;

  const fallback = (): GeneratedReport => {
    const { markdown, timeline } = buildTemplateReport(shiftId, events);
    return {
      markdown,
      timeline,
      metadata: { ...counts, source: 'template', generated_at: generatedAt },
    };
  };

  if (!apiKey) return fallback();

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: MODEL });

    const result = await model.generateContent(buildReportPrompt(events));
    const parsed = parseGeminiOutput(result.response.text());

    if (!parsed) {
      logger.error('Gemini output could not be parsed; using template', {
        shiftId,
      });
      return fallback();
    }

    return {
      markdown: parsed.markdown,
      timeline: parsed.timeline,
      metadata: { ...counts, source: 'gemini', generated_at: generatedAt },
    };
  } catch (e) {
    logger.error('Gemini call failed; using template', {
      shiftId,
      err: String(e),
    });
    return fallback();
  }
};
