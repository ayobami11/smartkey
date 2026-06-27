'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircleIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const commentSchema = z.object({
  text: z.string().min(1, 'Comment is required.'),
});

type CommentFormValues = z.infer<typeof commentSchema>;

type Props = { reportId: string };

export const CommentForm = ({ reportId }: Props) => {
  const router = useRouter();
  const [success, setSuccess] = useState(false);

  const form = useForm<CommentFormValues>({
    resolver: zodResolver(commentSchema),
    defaultValues: { text: '' },
  });

  const { isSubmitting, errors } = form.formState;

  const handleSubmit = form.handleSubmit(async ({ text }) => {
    try {
      const res = await fetch(`/api/reports/${reportId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const json = await res.json();
      if (!res.ok) {
        form.setError('root', {
          message:
            (json as { error?: string }).error ?? 'Failed to save comment.',
        });
        return;
      }
      setSuccess(true);
      form.reset();
      router.refresh();
    } catch {
      form.setError('root', {
        message: 'Network error. Check your connection and try again.',
      });
    }
  });

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
    <form onSubmit={handleSubmit} className="flex flex-col gap-2" noValidate>
      <Label htmlFor="report-comment">Add a comment</Label>
      <Textarea
        id="report-comment"
        placeholder="Add a note or observation to this report..."
        className="min-h-32 resize-none"
        aria-required="true"
        aria-invalid={!!errors.text}
        aria-describedby={errors.text ? 'comment-text-error' : undefined}
        {...form.register('text')}
      />
      <p className="text-xs text-muted-foreground">
        Comments are saved permanently and cannot be edited or deleted.
      </p>
      {errors.text && (
        <p
          id="comment-text-error"
          className="text-sm text-destructive"
          role="alert"
        >
          {errors.text.message}
        </p>
      )}
      {errors.root && (
        <p className="text-sm text-destructive" role="alert">
          {errors.root.message}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save comment'}
        </Button>
      </div>
    </form>
  );
};
