import Link from 'next/link';

import { Button } from '@/components/ui/button';

export default function ReturnKeyPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-sm text-muted-foreground">
        Log a key return from the dashboard outstanding keys list.
      </p>
      <Button asChild variant="outline">
        <Link href="/verifier">Go to dashboard</Link>
      </Button>
    </div>
  );
}
