'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { SparklesIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';

type Props = { shiftId: string };

/**
 * Completes a report the daily job scheduled but never generated.
 *
 * `POST /api/reports/generate` adopts the existing PENDING_GENERATION row
 * rather than creating a second one, so this is safe to press on any pending
 * report — including ones scheduled before the cron job could generate them.
 */
export const GenerateNowButton = ({ shiftId }: Props) => {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    const result = await apiFetch<{ report_id: string }>(
      '/api/reports/generate',
      { method: 'POST', body: { shift_id: shiftId } }
    );
    setGenerating(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        onClick={handleGenerate}
        disabled={generating}
        aria-busy={generating}
      >
        <SparklesIcon className="size-4" aria-hidden="true" />
        {generating ? 'Generating...' : 'Generate now'}
      </Button>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};
