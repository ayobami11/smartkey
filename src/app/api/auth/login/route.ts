import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

const MFA_ROLES = new Set(['CSO', 'HOD', 'VERIFIER']);

const bodySchema = z.object({
  email: z.string().email(),
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

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
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
      return NextResponse.json(err('Failed to send OTP', 500), { status: 500 });
    }
  }

  return NextResponse.json(
    ok({
      session: mfaRequired ? null : authData.session,
      role,
      mfa_required: mfaRequired,
    }),
  );
};
