import Link from 'next/link';
import { Suspense } from 'react';

import { ResetPasswordForm } from '@/app/(public)/reset-password/reset-password-form';

export const metadata = { title: 'Reset Password' };

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      {/* Brand header */}
      <div className="mb-8 text-center">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-primary">
          SmartKey
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          University of Lagos Senate Building
        </p>
      </div>

      {/* Form card */}
      <div className="w-full max-w-sm">
        <div className="rounded-lg border border-border bg-card p-8 shadow-sm">
          <Suspense
            fallback={
              <div className="h-48 animate-pulse rounded-md bg-muted" />
            }
          >
            <ResetPasswordForm />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Remember your password?{' '}
          <Link
            href="/login"
            className="text-primary underline underline-offset-4"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
