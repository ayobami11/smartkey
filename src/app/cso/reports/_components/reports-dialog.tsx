'use client';

import { useState } from 'react';

import { CheckCircleIcon, MessageSquareIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type Props = { report: { id: string; shift: number } };

export const ReportsDialog = ({ report }: Props) => {
  const [open, setOpen] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commenting, setCommenting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commentSuccess, setCommentSuccess] = useState(false);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setCommentText('');
      setCommentError(null);
      setCommentSuccess(false);
    }
  };

  const handleComment = async () => {
    if (!commentText.trim()) return;
    setCommenting(true);
    setCommentError(null);
    try {
      const res = await fetch(`/api/reports/${report.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: commentText.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setCommentError(
          (json as { error?: string }).error ?? 'Failed to save comment.'
        );
        return;
      }
      setCommentSuccess(true);
    } catch {
      setCommentError('Network error. Check your connection and try again.');
    } finally {
      setCommenting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Add comment to Shift ${report.shift} report`}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <MessageSquareIcon className="size-4" aria-hidden="true" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">
            Add comment — Shift {report.shift}
          </DialogTitle>
          <DialogDescription className="text-base">
            Comments are saved permanently to the report and cannot be edited or
            deleted.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {commentSuccess ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40">
                <CheckCircleIcon
                  className="size-6 text-emerald-600"
                  aria-hidden="true"
                />
              </div>
              <p className="font-medium text-foreground">Comment saved.</p>
              <p className="text-sm text-muted-foreground">
                Your comment has been added to the report permanently.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="comment-text">Comment</Label>
                <Textarea
                  id="comment-text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a note or observation to this report…"
                  rows={5}
                  aria-required="true"
                />
              </div>
              {commentError && (
                <p className="text-sm text-destructive" role="alert">
                  {commentError}
                </p>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          {commentSuccess ? (
            <DialogClose asChild>
              <Button className="w-full">Close</Button>
            </DialogClose>
          ) : (
            <>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button
                disabled={!commentText.trim() || commenting}
                aria-busy={commenting}
                onClick={handleComment}
              >
                {commenting ? 'Saving…' : 'Save comment'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
