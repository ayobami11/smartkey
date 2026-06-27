'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { EyeIcon, EyeOffIcon, LockIcon, MailIcon } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
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

import { apiFetch } from '@/lib/api';
import { loginSchema, type LoginInput } from '@/lib/validation/schemas';
import { OtpForm } from '@/app/(public)/login/_components/otp-form';

// Constants

const ROLE_REDIRECTS: Record<string, string> = {
  CSO: '/cso/dashboard',
  DEAN: '/dean/dashboard',
  VERIFIER: '/verifier/dashboard',
  REQUESTER: '/requester/dashboard',
};

// Component

export const LoginForm = () => {
  const router = useRouter();

  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [pendingEmail, setPendingEmail] = useState('');
  const [pendingRole, setPendingRole] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const credentialsForm = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const handleTogglePassword = () => setIsPasswordVisible((prev) => !prev);

  const handleCredentialsSubmit = async (data: LoginInput) => {
    const result = await apiFetch<{ role: string; mfa_required: boolean }>(
      '/api/auth/login',
      { method: 'POST', body: { email: data.email, password: data.password } }
    );
    if (result.error || !result.data) {
      toast.error(result.error ?? 'Sign in failed. Please try again.');
      return;
    }
    const { role, mfa_required } = result.data;
    if (mfa_required) {
      setPendingEmail(data.email);
      setPendingRole(role);
      setStep('otp');
      return;
    }
    router.push(ROLE_REDIRECTS[role] ?? '/');
  };

  if (step === 'otp') {
    return (
      <OtpForm
        pendingEmail={pendingEmail}
        pendingRole={pendingRole}
        onBack={() => setStep('credentials')}
      />
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
          {credentialsForm.formState.isSubmitting ? 'Signing in...' : 'Sign in'}
        </Button>
      </FieldGroup>
    </form>
  );
};
