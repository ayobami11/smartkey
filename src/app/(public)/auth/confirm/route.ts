import type { EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { createServerClient } from '@/lib/supabase/server';

// Verifies the one-time token from an invite / magic link server-side and
// establishes the session via cookies, then forwards the user to their
// activation screen. This is more reliable than detecting the session in the
// URL client-side, which the cookie-based SSR client cannot do consistently.
export const GET = async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/';

  if (!tokenHash || !type) {
    return NextResponse.redirect(
      new URL('/login?error=invalid-link', request.url)
    );
  }

  // Invite / magic links resolve before any role URL exists, so the session
  // lives in the transient `activate` namespace until the user signs in.
  const supabase = await createServerClient('activate');
  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error) {
    logger.error('auth/confirm: verifyOtp failed', { err: error.message });
    return NextResponse.redirect(
      new URL('/login?error=invalid-link', request.url)
    );
  }

  const safeNext = next.startsWith('/') ? next : `/${next}`;
  return NextResponse.redirect(new URL(safeNext, request.url));
};
