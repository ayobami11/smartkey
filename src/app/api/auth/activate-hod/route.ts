import { NextRequest, NextResponse } from 'next/server';

import { assessPlausibility } from '@/lib/ai/signature/verifier';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { password as passwordSchema } from '@/lib/validation/primitives';
import { err, ok } from '@/types/api';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export const POST = async (request: NextRequest) => {
  // The invite session lives in the transient `activate` namespace (set by
  // /auth/confirm); read it from there.
  const supabase = await createServerClient('activate');

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(err('Invalid form data', 422), { status: 422 });
  }

  const signature = formData.get('signature');
  const stamp = formData.get('stamp');

  const parsedPassword = passwordSchema.safeParse(formData.get('password'));
  if (!parsedPassword.success) {
    return NextResponse.json(
      err(parsedPassword.error.issues[0]?.message ?? 'Invalid password', 422),
      { status: 422 }
    );
  }
  const password = parsedPassword.data;
  if (!signature || !(signature instanceof File)) {
    return NextResponse.json(err('Signature image is required', 422), {
      status: 422,
    });
  }
  if (!stamp || !(stamp instanceof File)) {
    return NextResponse.json(err('Stamp image is required', 422), {
      status: 422,
    });
  }
  if (signature.size > MAX_IMAGE_BYTES || stamp.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(err('Images must be under 5 MB each', 413), {
      status: 413,
    });
  }

  // Read once here and reuse for both the plausibility check below and the
  // storage upload further down — no need to re-read the File a second time.
  const sigBytes = await signature.arrayBuffer();
  const stampBytes = await stamp.arrayBuffer();

  // Coarse sanity check that these actually look like a signature/stamp
  // before anything else happens — fails fast with no side effects (no
  // password change, no storage write) if the upload is obviously wrong
  // (blank, or an unrelated dense image).
  const sigPlausibility = await assessPlausibility(Buffer.from(sigBytes));
  if (!sigPlausibility.plausible) {
    return NextResponse.json(
      err(
        sigPlausibility.reason === 'too_sparse'
          ? "This doesn't look like a signature — the image appears blank. Please upload a clear photo or scan of just your signature."
          : "This doesn't look like a signature — the image has too much dark content. Please upload a clear, cropped photo of just your signature.",
        422
      ),
      { status: 422 }
    );
  }
  const stampPlausibility = await assessPlausibility(Buffer.from(stampBytes));
  if (!stampPlausibility.plausible) {
    return NextResponse.json(
      err(
        stampPlausibility.reason === 'too_sparse'
          ? "This doesn't look like a stamp — the image appears blank. Please upload a clear photo or scan of just your stamp."
          : "This doesn't look like a stamp — the image has too much dark content. Please upload a clear, cropped photo of just your stamp.",
        422
      ),
      { status: 422 }
    );
  }

  // Session is established by /api/auth/callback after the invite link is clicked.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      err('No active session — please click the invite link again', 401),
      { status: 401 }
    );
  }

  const userId = user.id;

  const { data: profileData } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  const profile = profileData as { role: string } | null;

  if (!profile || profile.role !== 'DEAN') {
    return NextResponse.json(err('Forbidden', 403), { status: 403 });
  }

  const { error: pwError } = await supabase.auth.updateUser({ password });
  if (pwError) {
    logger.error('activate-hod: password update failed', {
      userId,
      err: pwError.message,
    });
    return NextResponse.json(err('Failed to set password', 500), {
      status: 500,
    });
  }

  // Upload via the service-role client. The user is already verified above and
  // the paths are built from their verified id, so this is safe and avoids the
  // storage RLS auth-context fragility of the cookie-based server client.
  const adminClient = createAdminClient();

  const sigExt = signature.name.split('.').pop() ?? 'png';
  const sigPath = `${userId}/signature.${sigExt}`;

  const { error: sigUploadError } = await adminClient.storage
    .from('hod-signatures')
    .upload(sigPath, sigBytes, { contentType: signature.type, upsert: true });

  if (sigUploadError) {
    logger.error('activate-hod: signature upload failed', {
      userId,
      err: sigUploadError.message,
    });
    return NextResponse.json(err('Signature upload failed', 500), {
      status: 500,
    });
  }

  const stampExt = stamp.name.split('.').pop() ?? 'png';
  const stampPath = `${userId}/stamp.${stampExt}`;

  const { error: stampUploadError } = await adminClient.storage
    .from('hod-signatures')
    .upload(stampPath, stampBytes, { contentType: stamp.type, upsert: true });

  if (stampUploadError) {
    logger.error('activate-hod: stamp upload failed', {
      userId,
      err: stampUploadError.message,
    });
    return NextResponse.json(err('Stamp upload failed', 500), { status: 500 });
  }

  const { data: sigUrlData } = adminClient.storage
    .from('hod-signatures')
    .getPublicUrl(sigPath);
  const { data: stampUrlData } = adminClient.storage
    .from('hod-signatures')
    .getPublicUrl(stampPath);

  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      signature_ref_url: sigUrlData.publicUrl,
      stamp_ref_url: stampUrlData.publicUrl,
      status: 'ACTIVE',
    })
    .eq('id', userId);

  if (profileError) {
    logger.error('activate-hod: profile update failed', {
      userId,
      err: profileError.message,
    });
    return NextResponse.json(err('Profile update failed', 500), {
      status: 500,
    });
  }

  // Promote the activation session into the HOD cookie so the user lands on
  // their dashboard without having to sign in again.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) {
    const roleClient = await createServerClient('dean');
    await roleClient.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
  }

  return NextResponse.json(ok({ profile_id: userId, redirect: '/dean' }), {
    status: 201,
  });
};
