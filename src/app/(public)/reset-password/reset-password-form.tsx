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
import { toast } from 'sonner';
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
import { createBrowserClient } from '@/lib/supabase/client';
import { password } from '@/lib/validation/primitives';

const schema = z
  .object({ password, confirmPassword: password })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

type FormValues = z.infer<typeof schema>;

export const ResetPasswordForm = () => {
  const searchParams = useSearchParams();
  // The callback route (/api/auth/callback) exchanges the Supabase PKCE code
  // for a session before redirecting here, so the user is authenticated by the
  // time this form renders. The `error` param is set if the link expired.
  const linkError = searchParams.get('error');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [done, setDone] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const { isSubmitting } = form.formState;

  async function onSubmit(data: FormValues) {
    const supabase = createBrowserClient();
    const { error } = await supabase.auth.updateUser({
      password: data.password,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setDone(true);
  }

  if (linkError === 'expired') {
    return (
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <AlertCircleIcon
          className="size-10 text-destructive"
          aria-hidden="true"
        />
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Link expired
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This password reset link has expired or already been used. Request a
            new one to continue.
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
            Password updated
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
                  At least 12 characters with uppercase, lowercase, number, and
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
            {isSubmitting ? 'Updating...' : 'Update password'}
          </Button>
        </FieldGroup>
      </form>
    </>
  );
};
