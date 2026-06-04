import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { sendOtpEmail } from '@/lib/email/otp';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

const MFA_ROLES = new Set(['CSO', 'HOD', 'VERIFIER']);

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
    await supabase.auth.signInWithPassword({ email, password });

  if (authError || !authData.session) {
    return NextResponse.json(err('Invalid email or password', 401), { status: 401 });
  }

  const { data: profileData } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authData.user.id)
    .single();

  const role = (profileData as { role: string } | null)?.role ?? null;
  const mfaRequired = role ? MFA_ROLES.has(role) : false;

  if (mfaRequired) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const adminClient = createAdminClient();
    await adminClient.auth.admin.updateUserById(authData.user.id, {
      app_metadata: { mfa_code_hash: codeHash, mfa_code_expires_at: expiresAt },
    });

    try {
      await sendOtpEmail({ to: email, code });
    } catch (emailErr) {
      logger.error('OTP email failed', { email, err: String(emailErr) });
      return NextResponse.json(err('Failed to send verification code', 500), {
        status: 500,
      });
    }

    return NextResponse.json(ok({ session: null, role, mfa_required: true }));
  }

  return NextResponse.json(
    ok({ session: authData.session, role, mfa_required: false })
  );
};
