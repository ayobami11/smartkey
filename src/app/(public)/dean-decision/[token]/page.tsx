import Link from 'next/link';

import { DeanDecisionView } from './_components/dean-decision-view';

export const metadata = {
  title: 'Weekend Request Decision',
  robots: { index: false },
};

export default async function DeanDecisionPage({
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

      <DeanDecisionView token={token} />
    </main>
  );
}
