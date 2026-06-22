'use client';

import { DownloadIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';

type Comment = { author: string; created_at: string; text: string };

type Props = {
  fileName: string;
  markdown: string;
  comments: Comment[];
};

// Exports the report body (with comments appended) as a Markdown file via a Blob.
// Full PDF export (screens.md §9.2) is a follow-up; this gives the CSO an offline
// copy with no extra dependency.
export const DownloadReport = ({ fileName, markdown, comments }: Props) => {
  const handleDownload = () => {
    const commentBlock =
      comments.length > 0
        ? [
            '',
            '---',
            '',
            '## Comments',
            '',
            ...comments.map(
              (c) => `- **${c.author}** (${c.created_at}): ${c.text}`
            ),
          ].join('\n')
        : '';

    const blob = new Blob([markdown + commentBlock], {
      type: 'text/markdown',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button variant="outline" size="sm" onClick={handleDownload}>
      <DownloadIcon className="size-4" aria-hidden="true" />
      Download
    </Button>
  );
};
