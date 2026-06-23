import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB

// Lets a signed-in user replace their own profile photo from account settings.
// The namespace is resolved from the calling page (header/referer), so this one
// route serves every role's settings screen.
export const POST = async (request: NextRequest) => {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(err('Invalid form data', 422), { status: 422 });
  }

  const photo = formData.get('photo');
  if (!(photo instanceof File)) {
    return NextResponse.json(err('A photo file is required', 422), {
      status: 422,
    });
  }
  if (!photo.type.startsWith('image/')) {
    return NextResponse.json(err('File must be an image', 422), {
      status: 422,
    });
  }
  if (photo.size > MAX_PHOTO_BYTES) {
    return NextResponse.json(err('Photo must be under 5 MB', 413), {
      status: 413,
    });
  }

  const userId = user.id;

  // Upload via the service-role client. The user is verified above and the path
  // is built from their verified id, so this is safe and avoids the storage RLS
  // auth-context fragility of the cookie-based server client (same pattern as
  // the registration flow).
  const adminClient = createAdminClient();
  const photoBytes = await photo.arrayBuffer();
  const ext = photo.name.split('.').pop() ?? 'jpg';
  const photoPath = `${userId}/passport.${ext}`;

  const { error: uploadError } = await adminClient.storage
    .from('passport-photos')
    .upload(photoPath, photoBytes, { contentType: photo.type, upsert: true });

  if (uploadError) {
    logger.error('profile photo: upload failed', {
      userId,
      err: uploadError.message,
    });
    return NextResponse.json(err('Photo upload failed', 500), { status: 500 });
  }

  const { data: urlData } = adminClient.storage
    .from('passport-photos')
    .getPublicUrl(photoPath);
  const photoUrl = urlData.publicUrl;

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ photo_url: photoUrl })
    .eq('id', userId);

  if (profileError) {
    logger.error('profile photo: profile update failed', {
      userId,
      err: profileError.message,
    });
    return NextResponse.json(err('Failed to save photo', 500), { status: 500 });
  }

  return NextResponse.json(ok({ photo_url: photoUrl }), { status: 200 });
};

// Removes the authenticated user's profile photo from storage and clears photo_url.
export const DELETE = async () => {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });

  const userId = user.id;
  const adminClient = createAdminClient();

  // List files under the user's folder (extension varies — upsert on upload)
  const { data: files } = await adminClient.storage
    .from('passport-photos')
    .list(userId);

  if (files && files.length > 0) {
    const paths = files.map((f) => `${userId}/${f.name}`);
    const { error: removeError } = await adminClient.storage
      .from('passport-photos')
      .remove(paths);

    if (removeError) {
      logger.error('profile photo: delete failed', {
        userId,
        err: removeError.message,
      });
      return NextResponse.json(err('Failed to delete photo', 500), {
        status: 500,
      });
    }
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ photo_url: null })
    .eq('id', userId);

  if (profileError) {
    logger.error('profile photo: clear photo_url failed', {
      userId,
      err: profileError.message,
    });
    return NextResponse.json(err('Failed to clear photo', 500), {
      status: 500,
    });
  }

  return NextResponse.json(ok(null), { status: 200 });
};
