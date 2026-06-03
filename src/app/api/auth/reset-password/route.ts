import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { sendPasswordResetEmail } from '@/lib/email';
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

  const adminClient = createAdminClient();
  const { data: linkData, error: linkError } =
    await adminClient.auth.admin.generateLink({
      type: 'recovery',
      email: parsed.data.email,
      options: {
        redirectTo: `${siteUrl}/api/auth/callback?next=/reset-password`,
      },
    });

  if (linkError) {
    // User may not exist — silently ignore to prevent email enumeration.
    logger.info('reset-password: generateLink skipped', {
      reason: linkError.message,
    });
    return NextResponse.json(ok(null));
  }

  if (linkData?.properties?.action_link) {
    const { error: emailError } = await sendPasswordResetEmail({
      to: parsed.data.email,
      resetLink: linkData.properties.action_link,
    });
    if (emailError) {
      logger.error('reset-password: failed to send email', {
        err: emailError.message,
      });
    }
  }

  return NextResponse.json(ok(null));
};
