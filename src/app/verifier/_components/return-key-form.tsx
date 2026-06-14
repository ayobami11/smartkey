'use client';

import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { REGEXP_ONLY_DIGITS } from 'input-otp';

import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  returnKeyFormSchema,
  type ReturnKeyFormInput,
} from '@/lib/validation/schemas';

// Types

export type ReturnKeyFormProps = {
  requesterName: string;
  isOffline: boolean;
  isSubmitting: boolean;
  serverError: string | null;
  onSubmit: (code: string) => Promise<void>;
  onSwitchMode: () => void;
};

// Component

export const ReturnKeyForm = ({
  requesterName,
  isOffline,
  isSubmitting,
  serverError,
  onSubmit,
  onSwitchMode,
}: ReturnKeyFormProps) => {
  const { control, handleSubmit } = useForm<ReturnKeyFormInput>({
    resolver: zodResolver(returnKeyFormSchema),
    defaultValues: { return_code: '' },
  });

  const handleConfirm = handleSubmit(async (values) => {
    await onSubmit(values.return_code);
  });

  return (
    <form onSubmit={handleConfirm} className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Ask {requesterName} for the 6-digit return code shown on their
        dashboard.
      </p>
      <Controller
        name="return_code"
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <div className="flex flex-col items-start gap-3">
              <FieldLabel htmlFor="return-code-input">Return code</FieldLabel>
              <InputOTP
                id="return-code-input"
                maxLength={6}
                pattern={REGEXP_ONLY_DIGITS}
                value={field.value}
                onChange={field.onChange}
                disabled={isOffline || isSubmitting}
                autoComplete="one-time-code"
                aria-invalid={fieldState.invalid}
              >
                <InputOTPGroup>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTPSlot
                      key={i}
                      index={i}
                      className="size-12 font-mono text-base"
                    />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </div>
          </Field>
        )}
      />
      <Button
        variant="link"
        type="button"
        onClick={onSwitchMode}
        className="self-start text-xs text-foreground underline underline-offset-2 hover:text-primary"
      >
        Requester can&rsquo;t provide a code?
      </Button>
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
              {isSubmitting ? 'Marking returned…' : 'Confirm return'}
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
