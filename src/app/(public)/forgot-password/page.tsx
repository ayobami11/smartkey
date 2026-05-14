import Link from 'next/link';

import { ForgotPasswordForm } from '@/app/(public)/forgot-password/forgot-password-form';

export default function ForgotPasswordPage() {
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
          <ForgotPasswordForm />
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Remember your password?{' '}
          <Link
            href="/login"
            className="text-primary underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
