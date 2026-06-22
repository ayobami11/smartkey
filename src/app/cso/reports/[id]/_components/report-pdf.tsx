'use client';

import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from '@react-pdf/renderer';
import type { ReactNode } from 'react';

import type { TimelineEntry } from '@/lib/ai/reports/types';

// Branded PDF export of a shift report. Loaded dynamically from the Download
// button so @react-pdf/renderer stays out of the initial bundle and never runs
// on the server. Colours are the DESIGN.md tokens as literal hex — react-pdf
// has no access to the Tailwind CSS variables. Fonts use the built-in Helvetica
// (body) and Courier (timestamps, mirroring the mono-for-times rule); registering
// DM Sans / Fraunces is a later refinement, not required for an archival record.

const COLORS = {
  maroon: '#7B1F2D',
  text: '#0F172A',
  secondary: '#475569',
  faint: '#94A3B8',
  border: '#E2E8F0',
  muted: '#F8FAFC',
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 0,
    paddingBottom: 56,
    paddingHorizontal: 0,
    fontFamily: 'Helvetica',
    color: COLORS.text,
    fontSize: 10,
    lineHeight: 1.5,
  },
  header: {
    backgroundColor: COLORS.maroon,
    paddingVertical: 20,
    paddingHorizontal: 40,
    marginBottom: 24,
  },
  wordmark: { color: '#FFFFFF', fontSize: 12, fontFamily: 'Helvetica-Bold' },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    marginTop: 6,
  },
  meta: { color: '#F2D9DD', fontSize: 9, marginTop: 4 },
  body: { paddingHorizontal: 40 },
  h2: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.text,
    marginTop: 14,
    marginBottom: 5,
  },
  h3: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.text,
    marginTop: 10,
    marginBottom: 4,
  },
  paragraph: { fontSize: 10, marginBottom: 6, color: COLORS.text },
  listItem: { flexDirection: 'row', marginBottom: 3, paddingLeft: 6 },
  bullet: { width: 10, color: COLORS.secondary },
  listText: { flex: 1, fontSize: 10, color: COLORS.text },
  hr: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginVertical: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.text,
    marginTop: 18,
    marginBottom: 8,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
    paddingLeft: 8,
  },
  time: {
    fontFamily: 'Courier',
    fontSize: 9,
    color: COLORS.secondary,
    width: 56,
  },
  timelineBody: { flex: 1 },
  timelineEvent: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.text,
  },
  timelineDesc: { fontSize: 9, color: COLORS.secondary },
  comment: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    padding: 10,
    marginBottom: 6,
    backgroundColor: COLORS.muted,
  },
  commentHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  commentAuthor: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.text,
  },
  commentTime: { fontFamily: 'Courier', fontSize: 8, color: COLORS.faint },
  commentText: { fontSize: 10, color: COLORS.text },
  empty: { fontSize: 10, color: COLORS.faint },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  disclosure: { fontSize: 8, color: COLORS.faint },
  pageNumber: { fontSize: 8, color: COLORS.faint },
});

type Comment = { author: string; created_at: string; text: string };

export type ReportPdfData = {
  shiftLabel: string;
  metaLine: string;
  markdown: string;
  timeline: TimelineEntry[];
  comments: Comment[];
  isTemplate: boolean;
};

type Block = { type: 'h2' | 'h3' | 'p' | 'li'; text: string } | { type: 'hr' };

// Minimal parser for the constrained markdown the report generator emits:
// headings, paragraphs, bullet lists, horizontal rules. Inline bold is handled
// at render time. Anything unrecognised falls through as paragraph text.
const parseMarkdown = (md: string): Block[] => {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];

  const flush = () => {
    if (para.length > 0) {
      blocks.push({ type: 'p', text: para.join(' ') });
      para = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') {
      flush();
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flush();
      blocks.push({ type: 'hr' });
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({
        type: heading[1].length <= 2 ? 'h2' : 'h3',
        text: heading[2],
      });
      continue;
    }
    const li = /^[-*]\s+(.*)$/.exec(line);
    if (li) {
      flush();
      blocks.push({ type: 'li', text: li[1] });
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
};

// Renders inline **bold** runs; everything else is plain text.
const renderInline = (text: string): ReactNode[] =>
  text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter((segment) => segment.length > 0)
    .map((segment, i) => {
      const bold = /^\*\*([^*]+)\*\*$/.exec(segment);
      return bold ? (
        <Text key={i} style={{ fontFamily: 'Helvetica-Bold' }}>
          {bold[1]}
        </Text>
      ) : (
        <Text key={i}>{segment}</Text>
      );
    });

const ReportDocument = ({
  shiftLabel,
  metaLine,
  markdown,
  timeline,
  comments,
  isTemplate,
}: ReportPdfData) => {
  const blocks = parseMarkdown(markdown);

  return (
    <Document title={shiftLabel}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <Text style={styles.wordmark}>SmartKey</Text>
          <Text style={styles.title}>{shiftLabel}</Text>
          <Text style={styles.meta}>{metaLine}</Text>
        </View>

        <View style={styles.body}>
          {blocks.map((block, i) => {
            if (block.type === 'hr') return <View key={i} style={styles.hr} />;
            if (block.type === 'h2')
              return (
                <Text key={i} style={styles.h2}>
                  {block.text}
                </Text>
              );
            if (block.type === 'h3')
              return (
                <Text key={i} style={styles.h3}>
                  {block.text}
                </Text>
              );
            if (block.type === 'li')
              return (
                <View key={i} style={styles.listItem}>
                  <Text style={styles.bullet}>•</Text>
                  <Text style={styles.listText}>
                    {renderInline(block.text)}
                  </Text>
                </View>
              );
            return (
              <Text key={i} style={styles.paragraph}>
                {renderInline(block.text)}
              </Text>
            );
          })}

          <Text style={styles.sectionTitle}>Event timeline</Text>
          {timeline.length === 0 ? (
            <Text style={styles.empty}>No timeline events for this shift.</Text>
          ) : (
            timeline.map((entry, i) => (
              <View key={i} style={styles.timelineRow} wrap={false}>
                <Text style={styles.time}>{entry.time}</Text>
                <View style={styles.timelineBody}>
                  <Text style={styles.timelineEvent}>{entry.event}</Text>
                  <Text style={styles.timelineDesc}>{entry.description}</Text>
                </View>
              </View>
            ))
          )}

          <Text style={styles.sectionTitle}>
            Comments{comments.length > 0 ? ` (${comments.length})` : ''}
          </Text>
          {comments.length === 0 ? (
            <Text style={styles.empty}>No comments.</Text>
          ) : (
            comments.map((c, i) => (
              <View key={i} style={styles.comment} wrap={false}>
                <View style={styles.commentHead}>
                  <Text style={styles.commentAuthor}>{c.author}</Text>
                  <Text style={styles.commentTime}>{c.created_at}</Text>
                </View>
                <Text style={styles.commentText}>{c.text}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.disclosure}>
            Generated by AI from shift event data
            {isTemplate ? ' (template fallback)' : ''}
          </Text>
          <Text
            style={styles.pageNumber}
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
};

export const buildReportPdfBlob = (data: ReportPdfData): Promise<Blob> =>
  pdf(<ReportDocument {...data} />).toBlob();
