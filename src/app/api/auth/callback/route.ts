import { NextRequest, NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';

// Handles Supabase PKCE callback after password-reset or magic-link emails.
// Supabase redirects here with ?code=... after the user clicks the email link.
// This route exchanges the one-time code for a session (setting auth cookies),
// then forwards the user to the destination page.
export const GET = async (request: NextRequest) => {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    // Invite / reset links resolve before any role URL exists, so the session
    // lives in the transient `activate` namespace until the user signs in.
    const supabase = await createServerClient('activate');
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  return NextResponse.redirect(
    new URL('/forgot-password?error=expired', origin)
  );
};
