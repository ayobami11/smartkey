import { GoogleGenerativeAI } from '@google/generative-ai';

import { logger } from '@/lib/logger';

import { computeMetadataCounts, parseGeminiOutput } from './parser';
import { buildReportPrompt, buildTemplateReport } from './prompts';
import type {
  GeneratedReport,
  ReportEvent,
  TemplateFallbackReason,
} from './types';

// Default to the latest stable Flash model. Overridable without a code change
// via GEMINI_MODEL (e.g. when Google ships a newer release). Read per call so a
// report always records the model id that was actually in force when it ran.
// Server-side only — GEMINI_API_KEY must never be exposed to the browser.
// `||` rather than `??`: an env var set to the empty string is unset in
// practice, and platform dashboards make that easy to do by accident.
const DEFAULT_MODEL = 'gemini-3.5-flash';
const resolveModel = (): string => process.env.GEMINI_MODEL || DEFAULT_MODEL;

// Generate a shift report from the shift's audit events. Calls Gemini via the
// official SDK and falls back to a deterministic template when the key is
// absent, the call throws, or the response can't be parsed — the feature always
// returns usable output. Metadata counts are derived locally either way.
//
// The path taken is recorded in metadata.source / metadata.fallback_reason /
// metadata.model so the CSO can tell a lower-fidelity template report from a
// Gemini one, and can tell whether regenerating later is likely to help.
export const generateShiftReport = async (
  shiftId: string,
  events: ReportEvent[]
): Promise<GeneratedReport> => {
  const counts = computeMetadataCounts(events);
  const generatedAt = new Date().toISOString();
  const apiKey = process.env.GEMINI_API_KEY;
  const model = resolveModel();

  // `attemptedModel` is null only when no call was made at all (no API key).
  const fallback = (
    reason: TemplateFallbackReason,
    attemptedModel: string | null
  ): GeneratedReport => {
    const { markdown, timeline } = buildTemplateReport(shiftId, events);
    return {
      markdown,
      timeline,
      metadata: {
        ...counts,
        source: 'template',
        model: attemptedModel,
        fallback_reason: reason,
        generated_at: generatedAt,
      },
    };
  };

  if (!apiKey) {
    logger.warn('GEMINI_API_KEY not configured; using template report', {
      shiftId,
    });
    return fallback('no_api_key', null);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const generativeModel = genAI.getGenerativeModel({ model });

    const result = await generativeModel.generateContent(
      buildReportPrompt(events)
    );
    const parsed = parseGeminiOutput(result.response.text());

    if (!parsed) {
      logger.error('Gemini output could not be parsed; using template', {
        shiftId,
        model,
      });
      return fallback('unparseable_output', model);
    }

    return {
      markdown: parsed.markdown,
      timeline: parsed.timeline,
      metadata: {
        ...counts,
        source: 'gemini',
        model,
        fallback_reason: null,
        generated_at: generatedAt,
      },
    };
  } catch (e) {
    logger.error('Gemini call failed; using template', {
      shiftId,
      model,
      err: String(e),
    });
    return fallback('sdk_error', model);
  }
};
