import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_NAMESPACE, namespaceForRole } from '@/lib/supabase/cookies';
import { createServerClient } from '@/lib/supabase/server';
import { password as passwordSchema } from '@/lib/validation/primitives';
import { err, ok } from '@/types/api';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB

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

  const photo = formData.get('passport_photo');

  const parsedPassword = passwordSchema.safeParse(formData.get('password'));
  if (!parsedPassword.success) {
    return NextResponse.json(
      err(parsedPassword.error.issues[0]?.message ?? 'Invalid password', 422),
      { status: 422 }
    );
  }
  const password = parsedPassword.data;
  if (photo instanceof File && photo.size > MAX_PHOTO_BYTES) {
    return NextResponse.json(err('Photo must be under 5 MB', 413), {
      status: 413,
    });
  }

  // Session is established by /auth/confirm after the invite link is clicked.
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

  // Fetch role to determine whether a photo is required.
  const { data: profileRow } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  const userRole = (profileRow as { role: string } | null)?.role;

  if (userRole === 'REQUESTER' && !(photo instanceof File)) {
    return NextResponse.json(err('Passport photo is required', 422), {
      status: 422,
    });
  }

  // Update password
  const { error: pwError } = await supabase.auth.updateUser({ password });
  if (pwError) {
    logger.error('register: password update failed', {
      userId,
      err: pwError.message,
    });
    return NextResponse.json(err('Failed to set password', 500), {
      status: 500,
    });
  }

  let photoUrl: string | undefined;

  if (photo instanceof File) {
    // Upload via the service-role client. The user is already verified above
    // and the path is built from their verified id, so this is safe and avoids
    // the storage RLS auth-context fragility of the cookie-based server client.
    const adminClient = createAdminClient();
    const photoBytes = await photo.arrayBuffer();
    const ext = photo.name.split('.').pop() ?? 'jpg';
    const photoPath = `${userId}/passport.${ext}`;

    const { error: uploadError } = await adminClient.storage
      .from('passport-photos')
      .upload(photoPath, photoBytes, { contentType: photo.type, upsert: true });

    if (uploadError) {
      logger.error('register: photo upload failed', {
        userId,
        err: uploadError.message,
      });
      return NextResponse.json(err('Photo upload failed', 500), {
        status: 500,
      });
    }

    const { data: urlData } = adminClient.storage
      .from('passport-photos')
      .getPublicUrl(photoPath);
    photoUrl = urlData.publicUrl;
  }

  // Activate profile
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ status: 'ACTIVE', ...(photoUrl ? { photo_url: photoUrl } : {}) })
    .eq('id', userId);

  if (profileError) {
    logger.error('register: profile update failed', {
      userId,
      err: profileError.message,
    });
    return NextResponse.json(err('Profile update failed', 500), {
      status: 500,
    });
  }

  // Promote the activation session into the user's role cookie so they land on
  // their dashboard without having to sign in again.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) {
    const roleClient = await createServerClient(
      namespaceForRole(userRole) ?? DEFAULT_NAMESPACE
    );
    await roleClient.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
  }

  return NextResponse.json(ok({ profile_id: userId }), { status: 201 });
};
