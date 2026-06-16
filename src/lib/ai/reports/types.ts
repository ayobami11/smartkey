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

// Counts surfaced on the reports list card plus provenance of the report body.
export type ReportMetadata = {
  issued_count: number;
  returned_count: number;
  flagged_count: number;
  source: 'gemini' | 'template';
  generated_at: string;
};

// The full payload persisted to the shift_reports row.
export type GeneratedReport = {
  markdown: string;
  timeline: TimelineEntry[];
  metadata: ReportMetadata;
};
