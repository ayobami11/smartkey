'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { createBrowserClient } from '@/lib/supabase/client';

function ConfirmInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/';

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace(next);
      } else {
        router.replace('/login?error=invalid-link');
      }
    });
  }, [next, router]);

  return null;
}

export default function AuthConfirmPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground text-sm">Setting up your account…</p>
      <Suspense>
        <ConfirmInner />
      </Suspense>
    </div>
  );
}
