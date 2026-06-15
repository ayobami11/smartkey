import Link from 'next/link';

import { KeyRoundIcon, MonitorIcon, ShieldCheckIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <span className="font-display text-2xl font-semibold tracking-tight text-primary">
              SmartKey
            </span>
            <p className="text-xs text-muted-foreground">
              University of Lagos Senate Building
            </p>
          </div>
          <Button asChild>
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-36">
          <div className="mx-auto max-w-3xl text-center">
            <p className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              University of Lagos · Senate Building
            </p>
            <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Key management,
              <br />
              finally accountable.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              SmartKey replaces the paper logbook with a digital, AI-augmented
              system — real-time tracking, immutable audit trails, and
              role-based access for every key in the building.
            </p>
            <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="w-full sm:w-auto"
              >
                <Link href="/weekend-access">Request weekend access</Link>
              </Button>
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              No account? Visitors and contractors can{' '}
              <Link
                href="/weekend-access"
                className="text-primary underline-offset-4 hover:underline"
              >
                request weekend access
              </Link>{' '}
              with an HOD letter. Need a hand?{' '}
              <Link
                href="/help"
                className="text-primary underline-offset-4 hover:underline"
              >
                Get help
              </Link>
              .
            </p>
          </div>
        </section>

        {/* Value proposition */}
        <section className="border-t border-border bg-muted/40">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
            <div className="grid gap-10 lg:grid-cols-3">
              <div className="flex flex-col gap-4">
                <div className="flex size-10 items-center justify-center rounded-md border border-border bg-card">
                  <KeyRoundIcon
                    className="size-5 text-primary"
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    Real-time accountability
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Every key movement logged, timestamped, and traceable. An
                    immutable audit trail makes every action reviewable,
                    instantly.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex size-10 items-center justify-center rounded-md border border-border bg-card">
                  <ShieldCheckIcon
                    className="size-5 text-primary"
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    AI-assisted security
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Risk scoring, generated reports, and signature verification
                    protect every authorisation — with full transparency into
                    how decisions are made.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex size-10 items-center justify-center rounded-md border border-border bg-card">
                  <MonitorIcon
                    className="size-5 text-primary"
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    Built for the desk
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Optimised for speed under pressure, with full keyboard and
                    screen-reader support. Every flow completes in three
                    interactions or fewer.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="font-display text-lg font-semibold text-primary">
                SmartKey
              </span>
              <p className="text-xs text-muted-foreground">
                University of Lagos Senate Building
              </p>
            </div>
            <nav aria-label="Footer navigation">
              <Link
                href="/help"
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Contact support
              </Link>
            </nav>
          </div>
          <p className="mt-6 text-xs text-muted-foreground">
            © 2026 University of Lagos. SmartKey is a research project of the
            Department of Electrical and Electronics Engineering.
          </p>
        </div>
      </footer>
    </div>
  );
}
