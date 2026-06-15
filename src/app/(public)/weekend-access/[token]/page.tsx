import Link from 'next/link';

import { GuestWeekendStatus } from './_components/guest-weekend-status';

export default async function GuestWeekendStatusPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <main className="flex min-h-screen flex-col items-center bg-background px-4 py-12">
      {/* Brand header */}
      <div className="mb-8 text-center">
        <Link
          href="/"
          className="font-display text-3xl font-semibold tracking-tight text-primary underline-offset-4 hover:underline"
        >
          SmartKey
        </Link>
        <p className="mt-1 text-sm text-muted-foreground">
          University of Lagos Senate Building
        </p>
      </div>

      <GuestWeekendStatus token={token} />
    </main>
  );
}
