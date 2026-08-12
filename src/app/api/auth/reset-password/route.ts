import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { sendPasswordResetEmail } from '@/lib/email/otp';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { ok } from '@/types/api';

const bodySchema = z.object({
  email: z.email(),
});

export const POST = async (request: NextRequest) => {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  // Always return 200 — no email enumeration
  if (!parsed.success) return NextResponse.json(ok(null));

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://smartkey-ochre.vercel.app';

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: parsed.data.email,
    });

    if (!error && data.properties?.hashed_token) {
      const confirmParams = new URLSearchParams({
        token_hash: data.properties.hashed_token,
        type: data.properties.verification_type,
        next: '/reset-password',
      });
      await sendPasswordResetEmail({
        to: parsed.data.email,
        link: `${siteUrl}/auth/confirm?${confirmParams.toString()}`,
      });
    }
  } catch (e) {
    logger.error('password reset email failed', { error: e });
  }

  return NextResponse.json(ok(null));
};
