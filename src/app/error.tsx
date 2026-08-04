'use client';

import { useEffect } from 'react';

import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    logger.error('Unhandled render error', {
      err: error.message,
      digest: error.digest,
    });
  }, [error]);

  const reference = error.digest ?? 'unavailable';

  return (
    <main
      role="alert"
      className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12"
    >
      <div className="mb-10 text-center">
        <span className="font-display text-xl font-semibold tracking-tight text-primary">
          SmartKey
        </span>
        <p className="mt-0.5 text-xs text-muted-foreground">
          University of Lagos Senate Building
        </p>
      </div>

      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-semibold text-foreground">
          Something went wrong
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Nothing was lost — this page failed to load. Try again, or get help if
          it keeps happening.
        </p>
        <p className="mt-4 font-mono text-xs text-muted-foreground">
          Error reference: {reference} — share this with the CSO if you contact
          support.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button onClick={reset}>Try again</Button>
          <Button asChild variant="outline">
            <Link href="/help">Get help</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
