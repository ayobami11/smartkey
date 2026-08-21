import { NextRequest, NextResponse } from 'next/server';

import { sendActivationEmail } from '@/lib/email/otp';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

// Re-sends a fresh activation link to a user still in PENDING_ACTIVATION.
// Use when the original invite link expired before the user activated.
export const POST = async (
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;

  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });
  if (profile.role !== 'CSO')
    return NextResponse.json(err('Forbidden', 403), { status: 403 });

  const { data: target, error: fetchError } = await supabase
    .from('profiles')
    .select('id, institutional_email, role, status')
    .eq('id', id)
    .single();

  if (fetchError || !target) {
    return NextResponse.json(err('User not found', 404), { status: 404 });
  }

  if (target.status === 'ACTIVE') {
    return NextResponse.json(err('User is already active', 409), {
      status: 409,
    });
  }
  if (target.status === 'DEACTIVATED') {
    return NextResponse.json(
      err('User is deactivated — reinstate them first', 409),
      { status: 409 }
    );
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://smartkey-ochre.vercel.app';
  const activationPath =
    target.role === 'DEAN' ? '/dean/onboarding' : '/activate';

  // generateLink mints a fresh one-time token. We build our own /auth/confirm
  // link from the token hash (verified server-side via verifyOtp) and send it
  // via Gmail so delivery is reliable regardless of Supabase's SMTP config.
  const adminClient = createAdminClient();
  const { data: linkData, error: linkError } =
    await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: target.institutional_email,
    });

  if (linkError || !linkData?.properties?.hashed_token) {
    const ref = crypto.randomUUID();
    logger.error('resend-invite: generateLink failed', {
      id,
      err: linkError?.message ?? 'no hashed_token returned',
      ref,
    });
    return NextResponse.json(err(`Could not generate link. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  const confirmParams = new URLSearchParams({
    token_hash: linkData.properties.hashed_token,
    type: linkData.properties.verification_type,
    next: activationPath,
  });
  const confirmLink = `${siteUrl}/auth/confirm?${confirmParams.toString()}`;

  try {
    await sendActivationEmail({
      to: target.institutional_email,
      link: confirmLink,
      isReinvite: true,
    });
  } catch (e: unknown) {
    const ref = crypto.randomUUID();
    logger.error('resend-invite: email send failed', {
      id,
      err: String(e),
      ref,
    });
    return NextResponse.json(err(`Could not send email. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  return NextResponse.json(
    ok({ profile_id: id, status: 'PENDING_ACTIVATION' }),
    {
      status: 200,
    }
  );
};
