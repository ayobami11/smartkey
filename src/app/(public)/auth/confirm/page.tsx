'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { createBrowserClient } from '@/lib/supabase/client';

// Landing page for Supabase invite links (implicit flow).
// Supabase appends #access_token=...&refresh_token=... to the redirectTo URL.
// URL fragments never reach the server, so we need a client component to read them.
// createBrowserClient() has detectSessionInUrl: true by default — it parses the
// hash and sets the session automatically on instantiation. We then forward to
// the destination specified in the `next` query param.
export default function AuthConfirmPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/';

  useEffect(() => {
    // Instantiating the client triggers detectSessionInUrl which reads
    // #access_token=... from the URL hash and establishes the session.
    const supabase = createBrowserClient();

    // If the hash doesn't contain an access_token (e.g. stale or invalid link),
    // check whether there's already a session before redirecting to error.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace(next);
      } else {
        router.replace('/login?error=invalid-link');
      }
    });
  }, [next, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground text-sm">Setting up your account…</p>
    </div>
  );
}
