'use client';

import { useState } from 'react';

import { DownloadIcon, Loader2Icon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { TimelineEntry } from '@/lib/ai/reports/types';

type Comment = { author: string; created_at: string; text: string };

type Props = {
  fileName: string;
  shiftLabel: string;
  metaLine: string;
  markdown: string;
  timeline: TimelineEntry[];
  comments: Comment[];
  isTemplate: boolean;
};

// Single Download button. @react-pdf/renderer is heavy, so the document module
// is imported only on click — it stays out of the initial bundle and runs purely
// client-side.
export const DownloadReport = ({ fileName, ...data }: Props) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const handleDownload = async () => {
    setBusy(true);
    setError(false);
    try {
      const { buildReportPdfBlob } = await import('./report-pdf');
      const blob = await buildReportPdfBlob(data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={handleDownload}
        disabled={busy}
        aria-label="Download report as PDF"
      >
        {busy ? (
          <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <DownloadIcon className="size-4" aria-hidden="true" />
        )}
        {busy ? 'Preparing…' : 'Download PDF'}
      </Button>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          Could not generate the PDF. Try again.
        </p>
      )}
    </div>
  );
};
