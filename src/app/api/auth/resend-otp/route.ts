import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { sendOtpEmail } from '@/lib/email/otp';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_NAMESPACE, namespaceForRole } from '@/lib/supabase/cookies';
import { createServerClient } from '@/lib/supabase/server';
import { ok } from '@/types/api';

const bodySchema = z.object({
  email: z.email(),
});

export const POST = async (request: NextRequest) => {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json(ok(null));

  const { email } = parsed.data;

  const adminClient = createAdminClient();
  const { data: profile } = await adminClient
    .from('profiles')
    .select('id, role')
    .eq('institutional_email', email)
    .single();

  if (!profile) return NextResponse.json(ok(null));

  const namespace = namespaceForRole(profile.role) ?? DEFAULT_NAMESPACE;
  const supabase = await createServerClient(namespace);
  const {
    data: { user: sessionUser },
  } = await supabase.auth.getUser();
  const canRevealDeliveryStatus = sessionUser?.id === profile.id;

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const codeHash = crypto.createHash('sha256').update(code).digest('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await adminClient.auth.admin.updateUserById(profile.id, {
    app_metadata: { mfa_code_hash: codeHash, mfa_code_expires_at: expiresAt },
  });

  let deliveryFailed = false;
  try {
    await sendOtpEmail({ to: email, code });
  } catch (emailErr) {
    deliveryFailed = true;
    logger.error('resend-otp email failed', { email, err: String(emailErr) });
  }

  if (!canRevealDeliveryStatus) return NextResponse.json(ok(null));
  return NextResponse.json(ok({ email_delivery_failed: deliveryFailed }));
};
