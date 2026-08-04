// Types for the Gemini shift-report generator

// The subset of an audit_log row fed to Gemini and to the metadata counter.
// Mirrors the columns selected in POST /api/reports/generate.
export type ReportEvent = {
  event: string;
  actor_role: string | null;
  target_type: string | null;
  target_id: string | null;
  payload: Record<string, unknown> | null;
  occurred_at: string;
};

// One row of the structured timeline Gemini returns alongside the prose. Used
// to render the <ShiftTimeline> component on the report detail page.
export type TimelineEntry = {
  time: string;
  event: string;
  description: string;
};

// Why the deterministic template produced the report body instead of Gemini.
// The distinction is operational, not cosmetic:
//   - no_api_key         — GEMINI_API_KEY is unset. A deployment problem;
//                          regenerating changes nothing until it is fixed.
//   - sdk_error          — the SDK call threw (network, quota, bad model id).
//                          Usually transient; regenerating will probably work.
//   - unparseable_output — Gemini answered but the response failed the parser's
//                          schema. Model-behaviour problem; a retry may work.
export type TemplateFallbackReason =
  | 'no_api_key'
  | 'sdk_error'
  | 'unparseable_output';

// Provenance of the report body. Discriminated on `source` so the Gemini branch
// always carries the model id and the template branch always carries a reason.
// On the template branch `model` is the model that was *attempted* — null when
// no key was configured, because no call was ever made.
export type ReportProvenance =
  | { source: 'gemini'; model: string; fallback_reason: null }
  | {
      source: 'template';
      model: string | null;
      fallback_reason: TemplateFallbackReason;
    };

// Counts derived from the shift's audit events. Consumed by the reports list card.
export type ReportCounts = {
  issued_count: number;
  returned_count: number;
  flagged_count: number;
};

// Counts surfaced on the reports list card plus provenance of the report body.
export type ReportMetadata = ReportCounts &
  ReportProvenance & {
    generated_at: string;
  };

// The full payload persisted to the shift_reports row.
export type GeneratedReport = {
  markdown: string;
  timeline: TimelineEntry[];
  metadata: ReportMetadata;
};
