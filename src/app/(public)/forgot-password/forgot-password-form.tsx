'use client';

import Link from 'next/link';
import { useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2Icon, MailIcon } from 'lucide-react';
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
  InputGroupInput,
} from '@/components/ui/input-group';
import { email } from '@/lib/validation/primitives';

const schema = z.object({ email });

export const ForgotPasswordForm = () => {
  const [done, setDone] = useState(false);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  async function handleSubmit(data: z.infer<typeof schema>) {
    await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: data.email }),
    });
    setDone(true);
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <CheckCircle2Icon className="size-10 text-primary" aria-hidden="true" />
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Check your email
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            If that email address is registered, we will send you an email to reset your password.
          </p>
        </div>
        <Button asChild variant="outline" size="lg" className="mt-2 w-full">
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-foreground">
          Reset your password
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter your institutional email and we&apos;ll send you a link to reset
          your password.
        </p>
      </div>

      <form onSubmit={form.handleSubmit(handleSubmit)}>
        <FieldGroup>
          <Controller
            name="email"
            control={form.control}
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
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? 'Sending…' : 'Send reset link'}
          </Button>
        </FieldGroup>
      </form>
    </>
  );
};
