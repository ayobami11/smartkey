'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { EyeIcon, EyeOffIcon, LockIcon, MailIcon } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button } from '@/components/ui/button';
import {
  Field,
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
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { email, password } from '@/lib/validation/primitives';

// ── Constants ─────────────────────────────────────────────────────────────

const loginFormSchema = z.object({
  email: email,
  password: password,
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

const ROLE_REDIRECTS: Record<string, string> = {
  CSO: '/cso/dashboard',
  HOD: '/hod/dashboard',
  VERIFIER: '/verifier/dashboard',
  REQUESTER: '/requester/dashboard',
};

// ── Component ──────────────────────────────────────────────────────────────

export const LoginForm = () => {
  const router = useRouter();

  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [apiError, setApiError] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [pendingRole, setPendingRole] = useState('');

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '' },
  });

  const { isSubmitting } = form.formState;

  const handleTogglePassword = () => setIsPasswordVisible((prev) => !prev);

  // ── Step 1: credentials ───────────────────────────────────────────────────

  async function onSubmit(data: LoginFormValues) {
    setApiError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.email, password: data.password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setApiError(json.error ?? 'Sign in failed. Please try again.');
        return;
      }
      const { role, mfa_required } = json.data as {
        role: string;
        mfa_required: boolean;
      };
      if (mfa_required) {
        setPendingRole(role);
        setStep('otp');
        return;
      }
      router.push(ROLE_REDIRECTS[role] ?? '/');
    } catch {
      setApiError('Something went wrong. Check your connection and try again.');
    }
  }

  // ── Step 2: OTP ───────────────────────────────────────────────────────────

  async function handleOtpChange(value: string) {
    setOtp(value);
    if (value.length < 6) return;
    setOtpLoading(true);
    setApiError(null);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: value }),
      });
      const json = await res.json();
      if (!res.ok) {
        setApiError(json.error ?? 'Invalid or expired code. Try again.');
        setOtp('');
        setOtpLoading(false);
        return;
      }
      router.push(ROLE_REDIRECTS[pendingRole] ?? '/');
    } catch {
      setApiError('Something went wrong. Check your connection and try again.');
      setOtpLoading(false);
    }
  }

  // ── OTP step ──────────────────────────────────────────────────────────────

  if (step === 'otp') {
    return (
      <div className="flex flex-col gap-5">
        <p className="text-sm text-muted-foreground">
          A 6-digit code was sent to{' '}
          <span className="font-medium text-foreground">
            {form.getValues('email')}
          </span>
          . Enter it below to continue.
        </p>

        <div className="flex justify-center">
          <InputOTP
            maxLength={6}
            value={otp}
            onChange={handleOtpChange}
            disabled={otpLoading}
            aria-label="One-time password"
            autoFocus
          >
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>

        {apiError && (
          <p className="text-center text-sm text-destructive" role="alert">
            {apiError}
          </p>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full"
          disabled={otpLoading}
          onClick={() => {
            setStep('credentials');
            setOtp('');
            setApiError(null);
          }}
        >
          Back to sign in
        </Button>
      </div>
    );
  }

  // ── Credentials step ──────────────────────────────────────────────────────

  return (
    <form method="POST" onSubmit={form.handleSubmit(onSubmit)}>
      <FieldGroup>
        <Controller
          name="email"
          control={form.control}
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
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <div className="flex items-center">
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Link
                  href="/forgot-password"
                  className="ml-auto text-sm text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
                >
                  Forgot password?
                </Link>
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

        {apiError && (
          <p className="text-sm text-destructive" role="alert">
            {apiError}
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={isSubmitting}
          aria-disabled={isSubmitting}
        >
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </FieldGroup>
    </form>
  );
};
