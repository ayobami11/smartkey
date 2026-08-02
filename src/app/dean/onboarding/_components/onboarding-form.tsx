'use client';

import { useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { EyeIcon, EyeOffIcon, LockIcon } from 'lucide-react';
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
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { apiFetch } from '@/lib/api';
import { password } from '@/lib/validation/primitives';

const onboardingSchema = z
  .object({
    password: password,
    confirmPassword: z.string().min(1, 'Please confirm your password.'),
    confirmed: z.boolean().refine((val) => val === true, {
      message: 'You must confirm your signature and stamp.',
    }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

type OnboardingValues = z.infer<typeof onboardingSchema>;

type OnboardingFormProps = {
  sigFile: File;
  stampFile: File;
  onSuccess: () => void;
  onBack: () => void;
};

export const OnboardingForm = ({
  sigFile,
  stampFile,
  onSuccess,
  onBack,
}: OnboardingFormProps) => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const form = useForm<OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { password: '', confirmPassword: '', confirmed: false },
  });

  const handleSubmit = async (data: OnboardingValues) => {
    const formData = new FormData();
    formData.append('password', data.password);
    formData.append('signature', sigFile);
    formData.append('stamp', stampFile);

    const result = await apiFetch('/api/auth/activate-hod', {
      method: 'POST',
      body: formData,
    });

    if (result.error) {
      toast.error(result.error);
      return;
    }

    onSuccess();
  };

  return (
    <form
      onSubmit={form.handleSubmit(handleSubmit)}
      className="flex flex-col gap-6 rounded-lg border border-border bg-card p-6 shadow-[0_2px_4px_rgba(15,23,42,0.06)]"
    >
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Confirm and finish
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Set a password for your SmartKey account to complete setup.
        </p>
      </div>

      {/* Preview thumbnails */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Signature
          </p>
          {/* Local blob: preview of an unsaved upload — next/image can't optimize it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={URL.createObjectURL(sigFile)}
            alt="Signature reference"
            className="h-24 w-full object-contain"
          />
        </div>
        <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Departmental stamp
          </p>
          {/* Local blob: preview of an unsaved upload — next/image can't optimize it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={URL.createObjectURL(stampFile)}
            alt="Stamp reference"
            className="h-24 w-full object-contain"
          />
        </div>
      </div>

      {/* Password fields */}
      <FieldGroup>
        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <LockIcon aria-hidden="true" />
                </InputGroupAddon>
                <InputGroupInput
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="New password"
                  autoComplete="new-password"
                  aria-invalid={fieldState.invalid}
                  {...field}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    aria-label={
                      showPassword ? 'Hide password' : 'Show password'
                    }
                    size="icon-xs"
                    onClick={() => setShowPassword((prev) => !prev)}
                  >
                    {showPassword ? (
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

        <Controller
          name="confirmPassword"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="confirm-password">
                Confirm password
              </FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <LockIcon aria-hidden="true" />
                </InputGroupAddon>
                <InputGroupInput
                  id="confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                  aria-invalid={fieldState.invalid}
                  {...field}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    aria-label={
                      showConfirmPassword ? 'Hide password' : 'Show password'
                    }
                    size="icon-xs"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                  >
                    {showConfirmPassword ? (
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
      </FieldGroup>

      {/* Confirmation checkbox */}
      <Controller
        name="confirmed"
        control={form.control}
        render={({ field, fieldState }) => (
          <div className="flex flex-col gap-1.5">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                id="confirmed"
                checked={field.value}
                onChange={(e) => field.onChange(e.target.checked)}
                className="mt-0.5 size-4 accent-primary"
              />
              <span className="text-sm text-foreground">
                I confirm this is my signature and departmental stamp.
              </span>
            </label>
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </div>
        )}
      />

      <div className="flex justify-between">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          disabled={form.formState.isSubmitting}
        >
          Back
        </Button>
        <Button
          type="submit"
          disabled={form.formState.isSubmitting}
          aria-busy={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? 'Setting up...' : 'Finish setup'}
        </Button>
      </div>
    </form>
  );
};
