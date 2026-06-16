'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { CheckCircleIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type Props = { reportId: string };

// Posts an immutable comment to POST /api/reports/[id]/comments, then refreshes
// the server component so the new comment renders. Mirrors the success/error UX
// used in reports-dialog.tsx.
export const CommentForm = ({ reportId }: Props) => {
  const router = useRouter();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(
          (json as { error?: string }).error ?? 'Failed to save comment.'
        );
        return;
      }
      setSuccess(true);
      setText('');
      router.refresh();
    } catch {
      setError('Network error. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  if (success) {
    return (
      <div
        className="flex items-center gap-2 rounded-md border border-border bg-muted p-4"
        role="status"
      >
        <CheckCircleIcon
          className="size-5 text-emerald-600"
          aria-hidden="true"
        />
        <p className="text-sm text-foreground">
          Comment saved permanently.{' '}
          <button
            type="button"
            className="text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            onClick={() => setSuccess(false)}
          >
            Add another
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="report-comment">Add a comment</Label>
      <Textarea
        id="report-comment"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a note or observation to this report…"
        rows={4}
        aria-required="true"
      />
      <p className="text-xs text-muted-foreground">
        Comments are saved permanently and cannot be edited or deleted.
      </p>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button
          disabled={!text.trim() || saving}
          aria-busy={saving}
          onClick={handleSubmit}
        >
          {saving ? 'Saving…' : 'Save comment'}
        </Button>
      </div>
    </div>
  );
};
