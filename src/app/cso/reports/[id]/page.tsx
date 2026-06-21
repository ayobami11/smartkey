import { notFound } from 'next/navigation';

import { BotIcon } from 'lucide-react';

export const metadata = { title: 'Shift Report Details' };
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { ShiftTimeline } from '@/components/smartkey/shift-timeline';
import type { TimelineEntry } from '@/lib/ai/reports/types';
import { createServerClient } from '@/lib/supabase/server';

import { CommentForm } from '@/app/cso/reports/[id]/_components/comment-form';
import { DownloadReport } from '@/app/cso/reports/[id]/_components/download-report';
import {
  formatDate,
  formatTime,
} from '@/app/cso/reports/_components/reports-list';

// Shapes for the embedded query results (cast below; the generated DB types
// infer to-one embeds loosely).
type ReportRow = {
  id: string;
  markdown: string;
  timeline: unknown;
  metadata: Record<string, unknown> | null;
  generated_at: string;
  shift: {
    shift_number: number;
    started_at: string;
    ended_at: string | null;
    primary_officer: { full_name: string } | null;
    secondary_officer: { full_name: string } | null;
  } | null;
};

type CommentRow = {
  id: string;
  text: string;
  created_at: string;
  author: { full_name: string } | null;
};

// Map markdown elements to design-token classes (no @tailwindcss/typography in
// the project). react-markdown does not render raw HTML, so the AI output is safe.
const markdownComponents: Components = {
  h1: (props) => (
    <h2
      className="mt-6 mb-2 text-lg font-semibold text-foreground"
      {...props}
    />
  ),
  h2: (props) => (
    <h2
      className="mt-6 mb-2 text-lg font-semibold text-foreground"
      {...props}
    />
  ),
  h3: (props) => (
    <h3
      className="mt-4 mb-1.5 text-base font-semibold text-foreground"
      {...props}
    />
  ),
  p: (props) => (
    <p className="mb-3 text-sm leading-relaxed text-foreground" {...props} />
  ),
  ul: (props) => (
    <ul className="mb-3 list-disc pl-5 text-sm text-foreground" {...props} />
  ),
  ol: (props) => (
    <ol className="mb-3 list-decimal pl-5 text-sm text-foreground" {...props} />
  ),
  li: (props) => <li className="mb-1" {...props} />,
  strong: (props) => <strong className="font-semibold" {...props} />,
  em: (props) => <em className="italic text-muted-foreground" {...props} />,
  hr: (props) => <hr className="my-4 border-border" {...props} />,
  a: (props) => (
    <a
      className="text-primary underline underline-offset-4"
      target="_blank"
      rel="noreferrer"
      {...props}
    />
  ),
};

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerClient();

  const { data: reportData } = await supabase
    .from('shift_reports')
    .select(
      `id, markdown, timeline, metadata, generated_at,
       shift:shifts!shift_id(
         shift_number, started_at, ended_at,
         primary_officer:profiles!shifts_primary_officer_id_fkey(full_name),
         secondary_officer:profiles!shifts_secondary_officer_id_fkey(full_name)
       )`
    )
    .eq('id', id)
    .maybeSingle();

  if (!reportData) notFound();

  const report = reportData as unknown as ReportRow;

  const { data: commentsData } = await supabase
    .from('shift_report_comments')
    .select(
      `id, text, created_at,
       author:profiles!shift_report_comments_author_id_fkey(full_name)`
    )
    .eq('report_id', id)
    .order('created_at', { ascending: true });

  const comments = (commentsData as unknown as CommentRow[]) ?? [];

  const shift = report.shift;
  const officers = [
    shift?.primary_officer?.full_name,
    shift?.secondary_officer?.full_name,
  ].filter((n): n is string => Boolean(n));
  const startTime = shift?.started_at ? formatTime(shift.started_at) : '—';
  const endTime = shift?.ended_at ? formatTime(shift.ended_at) : 'ongoing';

  const timeline = Array.isArray(report.timeline)
    ? (report.timeline as TimelineEntry[])
    : [];
  const source = report.metadata?.source;
  const isPending = report.markdown === 'PENDING_GENERATION';

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 pt-0">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Shift {shift?.shift_number ?? '—'} report
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {formatDate(report.generated_at)} · {startTime}–{endTime}
              {officers.length > 0 && <> · {officers.join(', ')}</>}
            </p>
          </div>
          {!isPending && (
            <DownloadReport
              fileName={`shift-${shift?.shift_number ?? 'report'}-${id.slice(0, 8)}.md`}
              markdown={report.markdown}
              comments={comments.map((c) => ({
                author: c.author?.full_name ?? 'Unknown',
                created_at: formatDate(c.created_at),
                text: c.text,
              }))}
            />
          )}
        </div>
      </div>

      {isPending ? (
        <div
          className="rounded-lg border border-border bg-muted p-6 text-center"
          role="status"
        >
          <p className="text-sm font-medium text-foreground">
            This report is still generating.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Refresh in a moment to see the AI-generated summary.
          </p>
        </div>
      ) : (
        <>
          {/* Report body */}
          <section className="rounded-lg border border-border bg-card p-6 shadow-[0_2px_4px_rgba(15,23,42,0.06)]">
            <Markdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {report.markdown}
            </Markdown>
            <div className="mt-6 flex items-center gap-1.5 border-t border-border pt-4 text-xs text-muted-foreground">
              <BotIcon className="size-3.5" aria-hidden="true" />
              <span>
                Generated by AI from shift event data
                {source === 'template' && ' (template fallback)'}
              </span>
            </div>
          </section>

          {/* Timeline */}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-foreground">
              Event timeline
            </h2>
            <div className="rounded-lg border border-border bg-card p-6 shadow-[0_2px_4px_rgba(15,23,42,0.06)]">
              <ShiftTimeline entries={timeline} />
            </div>
          </section>

          {/* Comments */}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-foreground">
              Comments {comments.length > 0 && `(${comments.length})`}
            </h2>
            {comments.length > 0 && (
              <ul className="flex flex-col gap-3">
                {comments.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-lg border border-border bg-card p-4"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {c.author?.full_name ?? 'Unknown'}
                      </span>
                      <time className="font-mono text-xs text-muted-foreground">
                        {formatDate(c.created_at)} {formatTime(c.created_at)}
                      </time>
                    </div>
                    <p className="mt-1 text-sm text-foreground">{c.text}</p>
                  </li>
                ))}
              </ul>
            )}
            <CommentForm reportId={id} />
          </section>
        </>
      )}
    </div>
  );
}
