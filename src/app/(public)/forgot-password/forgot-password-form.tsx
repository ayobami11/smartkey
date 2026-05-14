'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  CheckCircle2Icon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  MailIcon,
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
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { email, password } from '@/lib/validation/primitives';

type Step = 'email' | 'otp' | 'password' | 'done';

const emailSchema = z.object({ email });

const passwordSchema = z
  .object({ password, confirmPassword: password })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export const ForgotPasswordForm = () => {
  const [step, setStep] = useState<Step>('email');
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  const emailForm = useForm<z.infer<typeof emailSchema>>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: '' },
  });

  const passwordForm = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  async function handleEmailSubmit(data: z.infer<typeof emailSchema>) {
    setSubmittedEmail(data.email);
    setResendCooldown(30);
    setStep('otp');
  }

  function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (otp.length < 6) {
      setOtpError('Please enter the full 6-digit code.');
      return;
    }
    setOtpError('');
    setStep('password');
  }

  function handleResend() {
    setOtp('');
    setResendCooldown(30);
  }

  async function handlePasswordSubmit(_data: z.infer<typeof passwordSchema>) {
    setStep('done');
  }

  if (step === 'done') {
    return (
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <CheckCircle2Icon
          className="size-10 text-primary"
          aria-hidden="true"
        />
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

  if (step === 'email') {
    return (
      <>
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-foreground">
            Reset your password
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your institutional email. We&apos;ll send you a 6-digit code
            to reset your password.
          </p>
        </div>
        <form onSubmit={emailForm.handleSubmit(handleEmailSubmit)}>
          <FieldGroup>
            <Controller
              name="email"
              control={emailForm.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="email">Institutional email</FieldLabel>
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
              disabled={emailForm.formState.isSubmitting}
            >
              {emailForm.formState.isSubmitting ? 'Sending…' : 'Send code'}
            </Button>
          </FieldGroup>
        </form>
      </>
    );
  }

  if (step === 'otp') {
    return (
      <>
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-foreground">
            Check your email
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter the 6-digit code we sent to{' '}
            <span className="font-medium text-foreground">{submittedEmail}</span>
            . It expires in 10 minutes.
          </p>
        </div>
        <form onSubmit={handleOtpSubmit}>
          <FieldGroup>
            <Field data-invalid={!!otpError}>
              <FieldLabel>Verification code</FieldLabel>
              <InputOTP
                maxLength={6}
                value={otp}
                onChange={(value) => {
                  setOtp(value);
                  if (otpError) setOtpError('');
                }}
                autoComplete="one-time-code"
                aria-label="6-digit verification code"
                aria-invalid={!!otpError}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
              {otpError && <FieldError>{otpError}</FieldError>}
            </Field>

            <Button type="submit" size="lg" className="w-full">
              Verify
            </Button>

            <div className="flex items-center justify-between text-sm">
              <span
                aria-live="polite"
                aria-atomic="true"
                className="text-muted-foreground"
              >
                {resendCooldown > 0 ? (
                  <>Resend in {resendCooldown}s</>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Resend code
                  </button>
                )}
              </span>
              <button
                type="button"
                onClick={() => setStep('email')}
                className="text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
              >
                Change email
              </button>
            </div>
          </FieldGroup>
        </form>
      </>
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
      <form onSubmit={passwordForm.handleSubmit(handlePasswordSubmit)}>
        <FieldGroup>
          <Controller
            name="password"
            control={passwordForm.control}
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
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
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
            control={passwordForm.control}
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
                      aria-label={showConfirm ? 'Hide password' : 'Show password'}
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
            disabled={passwordForm.formState.isSubmitting}
          >
            {passwordForm.formState.isSubmitting
              ? 'Resetting…'
              : 'Reset password'}
          </Button>
        </FieldGroup>
      </form>
    </>
  );
};
