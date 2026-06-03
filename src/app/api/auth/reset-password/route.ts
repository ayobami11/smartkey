import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase/server';
import { ok } from '@/types/api';

const bodySchema = z.object({
  email: z.email(),
});

export const POST = async (request: NextRequest) => {
  const supabase = await createServerClient();

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  // Always return 200 — no email enumeration
  if (!parsed.success) return NextResponse.json(ok(null));

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://smartkey-ochre.vercel.app';

  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl}/api/auth/callback?next=/reset-password`,
  });

  return NextResponse.json(ok(null));
};
