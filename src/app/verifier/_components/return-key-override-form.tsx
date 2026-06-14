'use client';

import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  returnKeyOverrideFormSchema,
  type ReturnKeyOverrideFormInput,
} from '@/lib/validation/schemas';

// Types

export type ReturnKeyOverrideFormProps = {
  isOffline: boolean;
  isSubmitting: boolean;
  serverError: string | null;
  onSubmit: (reason: string) => Promise<void>;
  onSwitchMode: () => void;
};

// Component

export const ReturnKeyOverrideForm = ({
  isOffline,
  isSubmitting,
  serverError,
  onSubmit,
  onSwitchMode,
}: ReturnKeyOverrideFormProps) => {
  const { control, handleSubmit } = useForm<ReturnKeyOverrideFormInput>({
    resolver: zodResolver(returnKeyOverrideFormSchema),
    defaultValues: { override_reason: '' },
  });

  const handleConfirm = handleSubmit(async (values) => {
    await onSubmit(values.override_reason);
  });

  return (
    <form onSubmit={handleConfirm} className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        This is recorded as an unverified return and raised to the CSO for
        review.
      </p>
      <Controller
        name="override_reason"
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <div className="flex flex-col gap-2">
              <FieldLabel htmlFor="override-reason">
                Reason for returning without a code
              </FieldLabel>
              <Textarea
                id="override-reason"
                {...field}
                placeholder="e.g. Requester lost their phone; a colleague returned the key."
                disabled={isOffline || isSubmitting}
                className="resize-none min-h-32"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </div>
          </Field>
        )}
      />
      <button
        type="button"
        onClick={onSwitchMode}
        className="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        Enter a code instead
      </button>
      {serverError && (
        <p className="text-xs text-destructive" role="alert">
          {serverError}
        </p>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="w-full">
            <Button
              type="submit"
              className="w-full"
              disabled={isOffline || isSubmitting}
              aria-busy={isSubmitting}
              style={isOffline ? { pointerEvents: 'none' } : undefined}
            >
              {isSubmitting ? 'Marking returned…' : 'Return without code'}
            </Button>
          </span>
        </TooltipTrigger>
        {isOffline && (
          <TooltipContent>Available again when you reconnect.</TooltipContent>
        )}
      </Tooltip>
    </form>
  );
};
