import { cn } from '@/lib/utils';
import Link from 'next/link';
import {
  ArrowRightIcon,
  KeyRoundIcon,
  MonitorIcon,
  ShieldCheckIcon,
} from 'lucide-react';

export const metadata = {
  description:
    'Digital key management for the University of Lagos Senate Building.',
  openGraph: {
    title: 'SmartKey',
    description:
      'Digital key management for the University of Lagos Senate Building.',
    type: 'website',
  },
};

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

// Data

const stats = [
  { value: '2', label: 'Building zones' },
  { value: '100+', label: 'Keys managed' },
  { value: '4', label: 'Roles supported' },
  { value: '0', label: 'Paper logbooks' },
];

const features = [
  {
    icon: KeyRoundIcon,
    title: 'Real-time accountability',
    body: 'Every key movement logged, timestamped, and traceable. An immutable audit trail makes every action reviewable instantly — no gaps, no ambiguity.',
  },
  {
    icon: ShieldCheckIcon,
    title: 'AI-assisted security',
    body: 'Rule-based risk scoring, Gemini-generated shift reports, and pixel-level signature verification — with full transparency into every decision.',
  },
  {
    icon: MonitorIcon,
    title: 'Built for speed',
    body: 'Every flow completes in three interactions or fewer. Optimised for the 24/7 security desk and equally usable on a phone for staff requesters.',
  },
];

const steps = [
  {
    n: '01',
    title: 'Submit a request',
    body: 'Authorised staff select their key and confirm the return time. The system scores the request and issues a 6-digit collection code by email.',
  },
  {
    n: '02',
    title: 'Collect at the desk',
    body: 'Present the code to the security verifier. The officer confirms identity and marks the key as issued in real time. No paper, no delay.',
  },
  {
    n: '03',
    title: 'Return and close',
    body: 'Return the key to the desk. The verifier records the handover, closing the audit loop with an immutable, timestamped entry.',
  },
];

// Page

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div>
            <span className="font-display text-xl font-semibold leading-none tracking-tight text-primary">
              SmartKey
            </span>
            <p className="mt-0.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              University of Lagos
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/help">Help</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="border-b border-border bg-muted/30">
          <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40">
            <p className="mb-5 text-xs font-medium uppercase tracking-widest text-primary">
              University of Lagos · Senate Building · Key Management
            </p>
            <h1 className="font-display max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight text-foreground sm:text-5xl lg:text-6xl xl:text-7xl">
              Key management,
              <br />
              finally accountable.
            </h1>
            <p className="mt-6 max-w-xl text-base text-muted-foreground sm:text-lg">
              SmartKey replaces the paper logbook with a digital, AI-augmented
              system: real-time tracking, immutable audit trails, and role-based
              access for every key in the building.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/login">
                  Sign in
                  <ArrowRightIcon className="size-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/weekend-access">Request weekend access</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Stats bar */}
        <section className="border-b border-border bg-card">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <dl className="grid grid-cols-2 sm:grid-cols-4">
              {stats.map((s, i) => (
                <div
                  key={s.label}
                  className={cn(
                    'flex flex-col items-center border-border px-6 py-8 text-center',
                    i % 2 === 0 && 'border-r',
                    i === 1 && 'sm:border-r',
                    i >= 2 && 'border-t sm:border-t-0'
                  )}
                >
                  <dt className="font-display text-3xl font-semibold text-primary sm:text-4xl">
                    {s.value}
                  </dt>
                  <dd className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {s.label}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Features */}
        <section className="bg-background">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
            <div className="mb-14 max-w-2xl">
              <p className="mb-3 text-xs font-medium uppercase tracking-widest text-primary">
                Capabilities
              </p>
              <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Built for institutional-grade access control
              </h2>
              <p className="mt-4 text-base text-muted-foreground">
                Three AI components and four role-specific dashboards work
                together to eliminate the gaps that paper leaves behind.
              </p>
            </div>
            <div className="grid gap-6 lg:grid-cols-3">
              {features.map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  className="rounded-lg border border-border bg-card p-6 shadow-[0_2px_4px_rgba(15,23,42,0.06)] transition-shadow hover:shadow-[0_4px_8px_rgba(15,23,42,0.08)]"
                >
                  <div className="mb-5 flex size-11 items-center justify-center rounded-md bg-primary/10">
                    <Icon className="size-5 text-primary" aria-hidden="true" />
                  </div>
                  <h3 className="text-base font-semibold text-foreground">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-border bg-muted/40">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
            <div className="mb-14 max-w-2xl">
              <p className="mb-3 text-xs font-medium uppercase tracking-widest text-primary">
                Process
              </p>
              <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                From request to return in minutes
              </h2>
              <p className="mt-4 text-base text-muted-foreground">
                The entire flow, from submitting a request to physically
                returning a key, is tracked, audited, and visible to the right
                people in real time.
              </p>
            </div>
            <div className="grid gap-10 lg:grid-cols-3">
              {steps.map(({ n, title, body }) => (
                <div key={n} className="flex flex-col gap-4">
                  <span className="font-display text-5xl font-semibold text-primary/60 sm:text-6xl">
                    {n}
                  </span>
                  <div>
                    <h3 className="text-base font-semibold text-foreground">
                      {title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="border-t border-border bg-secondary">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-xl">
                <h2 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">
                  Ready to get started?
                </h2>
                <p className="mt-3 text-base text-secondary-foreground">
                  Sign in with the credentials provisioned by your Chief
                  Security Officer. Visitors and contractors can submit a
                  weekend access request without an account.
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link href="/login">Sign in</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="bg-primary-foreground text-foreground hover:bg-primary-foreground/90 dark:bg-primary-foreground dark:text-background dark:hover:bg-primary-foreground/90"
                >
                  <Link href="/weekend-access">Weekend access</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-background">
        <div className="mx-auto max-w-7xl px-4 pt-10 pb-8 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <span className="font-display text-lg font-semibold text-primary">
                SmartKey
              </span>
              <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
                A digital key management system for the University of Lagos
                Senate Building. A research project of the Department of
                Electrical and Electronics Engineering.
              </p>
            </div>
            <nav className="flex flex-col gap-2" aria-label="Footer navigation">
              <Link
                href="/login"
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Sign in
              </Link>
              <Link
                href="/weekend-access"
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Weekend access
              </Link>
              <Link
                href="/help"
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Help &amp; support
              </Link>
            </nav>
          </div>
          <Separator className="my-8" />
          <p className="text-xs text-muted-foreground">
            © 2026 University of Lagos. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
