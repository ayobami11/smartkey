import Link from 'next/link';

import { Button } from '@/components/ui/button';

export const metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      {/* Brand header */}
      <div className="mb-10 text-center">
        <span className="font-display text-xl font-semibold tracking-tight text-primary">
          SmartKey
        </span>
        <p className="mt-0.5 text-xs text-muted-foreground">
          University of Lagos Senate Building
        </p>
      </div>

      {/* 404 block */}
      <div className="w-full max-w-sm text-center">
        <p className="text-8xl font-bold tracking-tight text-primary/30">404</p>
        <h1 className="mt-4 text-2xl font-semibold text-foreground">
          Page not found
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          This page doesn&apos;t exist or you may not have permission to view
          it. Double-check the URL, or head back to a page you know.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild>
            <Link href="/">Go to home page</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
        <p className="mt-8 text-xs text-muted-foreground">
          Need help?{' '}
          <Link
            href="/help"
            className="text-primary underline-offset-4 hover:underline"
          >
            Visit the help page
          </Link>
        </p>
      </div>
    </main>
  );
}
