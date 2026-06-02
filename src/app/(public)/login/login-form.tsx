'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  MailIcon,
  ShieldIcon,
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
import { email, password } from '@/lib/validation/primitives';

const ROLE_DASHBOARD: Record<string, string> = {
  CSO: '/cso',
  HOD: '/hod',
  VERIFIER: '/verifier',
  REQUESTER: '/me',
};

const credentialsSchema = z.object({
  email: email,
  password: password,
});

const otpSchema = z.object({
  otp: z
    .string()
    .length(6, 'Enter the 6-digit code from your email')
    .regex(/^\d{6}$/, 'Code must be 6 digits'),
});

type CredentialsValues = z.infer<typeof credentialsSchema>;
type OtpValues = z.infer<typeof otpSchema>;

export const LoginForm = () => {
  const router = useRouter();
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [pendingEmail, setPendingEmail] = useState('');
  const [pendingRole, setPendingRole] = useState<string | null>(null);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const credentialsForm = useForm<CredentialsValues>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: '', password: '' },
  });

  const otpForm = useForm<OtpValues>({
    resolver: zodResolver(otpSchema),
    defaultValues: { otp: '' },
  });

  const handleTogglePassword = () => setIsPasswordVisible((prev) => !prev);

  const handleCredentialsSubmit = async (data: CredentialsValues) => {
    setServerError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.email, password: data.password }),
      });

      const json = await res.json();

      if (!res.ok) {
        setServerError(json.error ?? 'Sign in failed. Please try again.');
        return;
      }

      if (json.data.mfa_required) {
        setPendingEmail(data.email);
        setPendingRole(json.data.role);
        setStep('otp');
        return;
      }

      router.push(ROLE_DASHBOARD[json.data.role] ?? '/');
    } catch {
      setServerError('Unable to reach the server. Check your connection.');
    }
  };

  const handleOtpSubmit = async (data: OtpValues) => {
    setServerError(null);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail, otp: data.otp }),
      });

      const json = await res.json();

      if (!res.ok) {
        setServerError(
          json.error ?? 'Invalid code. Check your email and try again.'
        );
        return;
      }

      router.refresh();
      router.push(ROLE_DASHBOARD[pendingRole ?? ''] ?? '/');
    } catch {
      setServerError('Unable to reach the server. Check your connection.');
    }
  };

  if (step === 'otp') {
    return (
      <form onSubmit={otpForm.handleSubmit(handleOtpSubmit)}>
        <FieldGroup>
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            <ShieldIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              A 6-digit code was sent to <strong>{pendingEmail}</strong>
            </span>
          </div>

          <Controller
            name="otp"
            control={otpForm.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="otp">Verification code</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    type="text"
                    id="otp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                    aria-invalid={fieldState.invalid}
                    {...field}
                  />
                </InputGroup>
                {fieldState.invalid ? (
                  <FieldError errors={[fieldState.error]} />
                ) : (
                  <FieldDescription>
                    Check your inbox — the code expires in 10 minutes.
                  </FieldDescription>
                )}
              </Field>
            )}
          />

          {serverError && (
            <p role="alert" className="text-sm text-destructive">
              {serverError}
            </p>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={otpForm.formState.isSubmitting}
            aria-disabled={otpForm.formState.isSubmitting}
          >
            {otpForm.formState.isSubmitting ? 'Verifying…' : 'Verify code'}
          </Button>

          <button
            type="button"
            className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            onClick={() => {
              setStep('credentials');
              setServerError(null);
              otpForm.reset();
            }}
          >
            Back to sign in
          </button>
        </FieldGroup>
      </form>
    );
  }

  return (
    <form onSubmit={credentialsForm.handleSubmit(handleCredentialsSubmit)}>
      <FieldGroup>
        <Controller
          name="email"
          control={credentialsForm.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <MailIcon aria-hidden="true" />
                </InputGroupAddon>
                <InputGroupInput
                  type="email"
                  placeholder="you@unilag.edu.ng"
                  id="email"
                  aria-invalid={fieldState.invalid}
                  autoComplete="email"
                  {...field}
                />
              </InputGroup>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          name="password"
          control={credentialsForm.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <div className="flex items-center">
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <a
                  href="/forgot-password"
                  className="ml-auto text-sm text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
                >
                  Forgot password?
                </a>
              </div>
              <InputGroup>
                <InputGroupAddon>
                  <LockIcon aria-hidden="true" />
                </InputGroupAddon>
                <InputGroupInput
                  type={isPasswordVisible ? 'text' : 'password'}
                  id="password"
                  aria-invalid={fieldState.invalid}
                  autoComplete="current-password"
                  {...field}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    aria-label={
                      isPasswordVisible ? 'Hide password' : 'Show password'
                    }
                    size="icon-xs"
                    onClick={handleTogglePassword}
                  >
                    {isPasswordVisible ? (
                      <EyeOffIcon aria-hidden="true" />
                    ) : (
                      <EyeIcon aria-hidden="true" />
                    )}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        {serverError && (
          <p role="alert" className="text-sm text-destructive">
            {serverError}
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={credentialsForm.formState.isSubmitting}
          aria-disabled={credentialsForm.formState.isSubmitting}
        >
          {credentialsForm.formState.isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </FieldGroup>
    </form>
  );
};
