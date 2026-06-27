'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { ShieldIcon } from 'lucide-react';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import * as z from 'zod';

import { Button } from '@/components/ui/button';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';

// Schema

const otpSchema = z.object({
  otp: z
    .string()
    .length(6, 'Enter the 6-digit code sent to your email.')
    .regex(/^\d{6}$/, 'Code must be 6 digits'),
});

type OtpValues = z.infer<typeof otpSchema>;

// Constants

const ROLE_REDIRECTS: Record<string, string> = {
  CSO: '/cso/dashboard',
  DEAN: '/dean/dashboard',
  VERIFIER: '/verifier/dashboard',
  REQUESTER: '/requester/dashboard',
};

// Helpers

const maskEmail = (email: string) => {
  const [local, domain] = email.split('@');
  if (!domain || local.length <= 3) return email;
  return `${local.slice(0, 3)}***@${domain}`;
};

// Types

type OtpFormProps = {
  pendingEmail: string;
  pendingRole: string;
  onBack: () => void;
};

// Component

export const OtpForm = ({
  pendingEmail,
  pendingRole,
  onBack,
}: OtpFormProps) => {
  const router = useRouter();

  const [isVerifying, setIsVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPasteRef = useRef(false);
  const submitBtnRef = useRef<HTMLButtonElement>(null);

  const otpForm = useForm<OtpValues>({
    resolver: zodResolver(otpSchema),
    defaultValues: { otp: '' },
  });

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

  useEffect(() => {
    startCooldown(60);
    return () => clearInterval(cooldownRef.current!);
  }, []);

  const handleOtpSubmit = async (data: OtpValues) => {
    setIsVerifying(true);
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
    } finally {
      setIsVerifying(false);
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

  return (
    <form onSubmit={otpForm.handleSubmit(handleOtpSubmit)} noValidate>
      <FieldGroup>
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          <ShieldIcon className="size-4 shrink-0" aria-hidden="true" />
          <span>
            Enter the verification code we sent to your email address:{' '}
            <strong className="text-foreground">
              {maskEmail(pendingEmail)}
            </strong>
          </span>
        </div>

        <Controller
          name="otp"
          control={otpForm.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <div className="flex flex-col items-start gap-3">
                <FieldLabel htmlFor="otp">Verification code</FieldLabel>
                <InputOTP
                  id="otp"
                  maxLength={6}
                  value={field.value}
                  onChange={(value) => {
                    field.onChange(value);
                    if (value.length === 6) {
                      if (isPasteRef.current) {
                        otpForm.handleSubmit(handleOtpSubmit)();
                      } else {
                        submitBtnRef.current?.focus();
                      }
                      isPasteRef.current = false;
                    }
                  }}
                  onPaste={() => {
                    isPasteRef.current = true;
                  }}
                  autoComplete="one-time-code"
                  autoFocus
                  aria-invalid={fieldState.invalid}
                  pattern={REGEXP_ONLY_DIGITS}
                >
                  <InputOTPGroup>
                    <InputOTPSlot
                      index={0}
                      className="size-12 font-mono text-xl"
                    />
                    <InputOTPSlot
                      index={1}
                      className="size-12 font-mono text-xl"
                    />
                    <InputOTPSlot
                      index={2}
                      className="size-12 font-mono text-xl"
                    />
                    <InputOTPSlot
                      index={3}
                      className="size-12 font-mono text-xl"
                    />
                    <InputOTPSlot
                      index={4}
                      className="size-12 font-mono text-xl"
                    />
                    <InputOTPSlot
                      index={5}
                      className="size-12 font-mono text-xl"
                    />
                  </InputOTPGroup>
                </InputOTP>
                {fieldState.invalid ? (
                  <FieldError errors={[fieldState.error]} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Check your inbox — the code expires in 10 minutes.
                  </p>
                )}
              </div>
            </Field>
          )}
        />

        <Button
          ref={submitBtnRef}
          type="submit"
          size="lg"
          className="w-full"
          disabled={isVerifying || otpForm.formState.isSubmitting}
          aria-disabled={isVerifying || otpForm.formState.isSubmitting}
        >
          {isVerifying || otpForm.formState.isSubmitting
            ? 'Verifying...'
            : 'Verify code'}
        </Button>

        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-50"
            onClick={handleResendOtp}
            disabled={resendCooldown > 0 || isResending}
          >
            {isResending
              ? 'Sending...'
              : resendCooldown > 0
                ? `Resend code in ${resendCooldown}s`
                : "Didn't receive a code? Resend"}
          </button>
          <button
            type="button"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            onClick={onBack}
          >
            Back to sign in
          </button>
        </div>
      </FieldGroup>
    </form>
  );
};
