import Link from 'next/link';

import { LoginForm } from '@/app/(public)/login/login-form';

export default function LoginPage() {
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

      {/* Login card */}
      <div className="w-full max-w-sm">
        <div className="rounded-lg border border-border bg-card p-8 shadow-sm">
          <h2 className="mb-6 text-lg font-semibold text-foreground">
            Sign in to your account
          </h2>
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Need help signing in?{' '}
          <Link
            href="/help"
            className="text-primary underline-offset-4 hover:underline"
          >
            Get help
          </Link>
        </p>
      </div>
    </main>
  );
}
