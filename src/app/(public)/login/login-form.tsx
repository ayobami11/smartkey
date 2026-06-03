'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  MailIcon,
  ShieldIcon,
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
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { email, password } from '@/lib/validation/primitives';

// ── Schemas ───────────────────────────────────────────────────────────────

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

// ── Constants ─────────────────────────────────────────────────────────────

const ROLE_REDIRECTS: Record<string, string> = {
  CSO: '/cso/dashboard',
  HOD: '/hod/dashboard',
  VERIFIER: '/verifier/dashboard',
  REQUESTER: '/requester/dashboard',
};

// ── Component ──────────────────────────────────────────────────────────────

export const LoginForm = () => {
  const router = useRouter();

  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [pendingEmail, setPendingEmail] = useState('');
  const [pendingRole, setPendingRole] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const credentialsForm = useForm<CredentialsValues>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: '', password: '' },
  });

  const otpForm = useForm<OtpValues>({
    resolver: zodResolver(otpSchema),
    defaultValues: { otp: '' },
  });

  const handleTogglePassword = () => setIsPasswordVisible((prev) => !prev);

  const startCooldown = (seconds: number) => {
    setResendCooldown(seconds);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => () => clearInterval(cooldownRef.current!), []);

  // ── Step 1: credentials ───────────────────────────────────────────────────

  const handleCredentialsSubmit = async (data: CredentialsValues) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.email, password: data.password }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? 'Sign in failed. Please try again.');
        return;
      }
      const { role, mfa_required } = json.data as {
        role: string;
        mfa_required: boolean;
      };
      if (mfa_required) {
        setPendingEmail(data.email);
        setPendingRole(role);
        setStep('otp');
        startCooldown(60);
        return;
      }
      router.push(ROLE_REDIRECTS[role] ?? '/');
    } catch {
      toast.error('Unable to reach the server. Check your connection.');
    }
  };

  // ── Step 2: OTP ───────────────────────────────────────────────────────────

  const handleOtpSubmit = async (data: OtpValues) => {
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail, otp: data.otp }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(
          json.error ?? 'Invalid code. Check your email and try again.'
        );
        return;
      }
      router.push(ROLE_REDIRECTS[pendingRole] ?? '/');
    } catch {
      toast.error('Unable to reach the server. Check your connection.');
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || isResending) return;
    setIsResending(true);
    try {
      await fetch('/api/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail }),
      });
      toast.success('New code sent — check your inbox.');
      startCooldown(60);
    } catch {
      toast.error('Could not resend. Try again in a moment.');
    } finally {
      setIsResending(false);
    }
  };

  // ── OTP step ──────────────────────────────────────────────────────────────

  if (step === 'otp') {
    return (
      <form onSubmit={otpForm.handleSubmit(handleOtpSubmit)}>
        <FieldGroup>
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            <ShieldIcon className="size-4 shrink-0" aria-hidden="true" />
            <span>
              A 6-digit code was sent to{' '}
              <strong className="text-foreground">{pendingEmail}</strong>
            </span>
          </div>

          <Controller
            name="otp"
            control={otpForm.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="otp">Verification code</FieldLabel>
                <InputOTP
                  maxLength={6}
                  value={field.value}
                  onChange={field.onChange}
                  aria-invalid={fieldState.invalid}
                  aria-label="One-time password"
                  autoFocus
                >
                  <InputOTPGroup>
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <InputOTPSlot key={i} index={i} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
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

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={otpForm.formState.isSubmitting}
            aria-disabled={otpForm.formState.isSubmitting}
          >
            {otpForm.formState.isSubmitting ? 'Verifying…' : 'Verify code'}
          </Button>

          <div className="flex flex-col items-center gap-1">
            <button
              type="button"
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-50"
              onClick={handleResendOtp}
              disabled={resendCooldown > 0 || isResending}
            >
              {isResending
                ? 'Sending…'
                : resendCooldown > 0
                  ? `Resend code in ${resendCooldown}s`
                  : "Didn't receive a code? Resend"}
            </button>
            <button
              type="button"
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              onClick={() => {
                setStep('credentials');
                otpForm.reset();
              }}
            >
              Back to sign in
            </button>
          </div>
        </FieldGroup>
      </form>
    );
  }

  // ── Credentials step ──────────────────────────────────────────────────────

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
