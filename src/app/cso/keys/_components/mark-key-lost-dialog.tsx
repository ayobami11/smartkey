'use client';

import { useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import {
  markKeyLostFormSchema,
  type MarkKeyLostFormInput,
} from '@/lib/validation/schemas';

type Props = {
  target: { id: string; code: string } | null;
  onClose: () => void;
  onMarked: () => void;
};

export const MarkKeyLostDialog = ({ target, onClose, onMarked }: Props) => {
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { control, handleSubmit, reset } = useForm<MarkKeyLostFormInput>({
    resolver: zodResolver(markKeyLostFormSchema),
    defaultValues: { note: '' },
  });

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
      reset();
      setError(null);
    }
  };

  const handleConfirm = handleSubmit(async (values) => {
    if (!target) return;
    setMarking(true);
    setError(null);
    try {
      const res = await fetch('/api/keys/mark-lost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_id: target.id, note: values.note }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to mark key as lost.');
        return;
      }
      reset();
      onClose();
      onMarked();
    } catch {
      setError('Something went wrong. Check your connection.');
    } finally {
      setMarking(false);
    }
  });

  return (
    <Dialog open={target !== null} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">
            Mark key {target?.code} as lost
          </DialogTitle>
          <DialogDescription className="text-base">
            This will retire the key and open a HIGH-severity incident. This
            action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleConfirm} className="flex flex-col gap-4">
          <Controller
            name="note"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="lost-note">Lost note</FieldLabel>
                <Textarea
                  id="lost-note"
                  {...field}
                  placeholder="Describe when and how the key went missing…"
                  className="resize-none min-h-32"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant="destructive"
              className="bg-destructive/80 text-destructive-foreground hover:bg-destructive"
              disabled={marking}
              aria-busy={marking}
            >
              {marking ? 'Marking…' : 'Mark as lost'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
