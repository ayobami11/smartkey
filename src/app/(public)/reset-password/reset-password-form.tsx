'use client';

import Link from 'next/link';
import { useState } from 'react';

import { useSearchParams } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
} from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button } from '@/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { password } from '@/lib/validation/primitives';

const resetPasswordFormSchema = z
  .object({
    password: password,
    confirmPassword: password,
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

type ResetPasswordValues = z.infer<typeof resetPasswordFormSchema>;

export const ResetPasswordForm = () => {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [done, setDone] = useState(false);

  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const { isSubmitting } = form.formState;

  async function onSubmit(_data: ResetPasswordValues) {
    // API call using token will go here
    setDone(true);
  }

  if (!token) {
    return (
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <AlertCircleIcon
          className="size-10 text-destructive"
          aria-hidden="true"
        />
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Invalid or expired link
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This password reset link is missing or has expired. Request a new
            one to continue.
          </p>
        </div>
        <Button asChild size="lg" className="mt-2 w-full">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <CheckCircle2Icon className="size-10 text-primary" aria-hidden="true" />
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Password reset
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your password has been updated. Sign in with your new password.
          </p>
        </div>
        <Button asChild size="lg" className="mt-2 w-full">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-foreground">
          Set a new password
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a strong password for your account.
        </p>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FieldGroup>
          <Controller
            name="password"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="new-password">New password</FieldLabel>
                <InputGroup>
                  <InputGroupAddon>
                    <LockIcon aria-hidden="true" />
                  </InputGroupAddon>
                  <InputGroupInput
                    type={showPassword ? 'text' : 'password'}
                    id="new-password"
                    aria-invalid={fieldState.invalid}
                    autoComplete="new-password"
                    {...field}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      aria-label={
                        showPassword ? 'Hide password' : 'Show password'
                      }
                      size="icon-xs"
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? (
                        <EyeOffIcon aria-hidden="true" />
                      ) : (
                        <EyeIcon aria-hidden="true" />
                      )}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
                <FieldDescription>
                  At least 8 characters with uppercase, lowercase, number, and
                  special character.
                </FieldDescription>
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />

          <Controller
            name="confirmPassword"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="confirm-password">
                  Confirm new password
                </FieldLabel>
                <InputGroup>
                  <InputGroupAddon>
                    <LockIcon aria-hidden="true" />
                  </InputGroupAddon>
                  <InputGroupInput
                    type={showConfirm ? 'text' : 'password'}
                    id="confirm-password"
                    aria-invalid={fieldState.invalid}
                    autoComplete="new-password"
                    {...field}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      aria-label={
                        showConfirm ? 'Hide password' : 'Show password'
                      }
                      size="icon-xs"
                      onClick={() => setShowConfirm((v) => !v)}
                    >
                      {showConfirm ? (
                        <EyeOffIcon aria-hidden="true" />
                      ) : (
                        <EyeIcon aria-hidden="true" />
                      )}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Resetting…' : 'Reset password'}
          </Button>
        </FieldGroup>
      </form>
    </>
  );
};
