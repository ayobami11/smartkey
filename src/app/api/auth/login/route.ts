import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { err, ok } from '@/types/api';

// OTP MFA temporarily disabled — re-enable once SMTP (Resend) is configured
const MFA_ROLES = new Set<string>();

const bodySchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const POST = async (request: NextRequest) => {
  const supabase = await createServerClient();

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(err('Invalid request body', 422), { status: 422 });
  }

  const { email, password } = parsed.data;

  const { data: authData, error: authError } =
    await supabase.auth.signInWithPassword({
      email,
      password,
    });

  if (authError || !authData.session) {
    return NextResponse.json(err('Invalid credentials', 401), { status: 401 });
  }

  const { data: profileData } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authData.user.id)
    .single();

  const role = (profileData as { role: string } | null)?.role ?? null;
  const mfaRequired = role ? MFA_ROLES.has(role) : false;

  if (mfaRequired) {
    const { error: otpError } = await supabase.auth.signInWithOtp({ email });
    if (otpError) {
      logger.error('OTP send failed', {
        email,
        error: otpError.message,
        code: otpError.status,
      });
      return NextResponse.json(
        err(`Failed to send OTP: ${otpError.message}`, 500),
        { status: 500 }
      );
    }
  }

  return NextResponse.json(
    ok({
      session: mfaRequired ? null : authData.session,
      role,
      mfa_required: mfaRequired,
    })
  );
};
