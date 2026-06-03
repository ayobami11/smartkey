import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { sendOtpEmail } from '@/lib/email/otp';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { ok } from '@/types/api';

const bodySchema = z.object({
  email: z.email(),
});

export const POST = async (request: NextRequest) => {
  const supabase = await createServerClient();

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json(ok(null));

  const { email } = parsed.data;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('institutional_email', email)
    .single();

  if (!profile) return NextResponse.json(ok(null));

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const codeHash = crypto.createHash('sha256').update(code).digest('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const adminClient = createAdminClient();
  await adminClient.auth.admin.updateUserById(profile.id, {
    app_metadata: { mfa_code_hash: codeHash, mfa_code_expires_at: expiresAt },
  });

  try {
    await sendOtpEmail({ to: email, code });
  } catch (emailErr) {
    logger.error('resend-otp email failed', { email, err: String(emailErr) });
  }

  return NextResponse.json(ok(null));
};
