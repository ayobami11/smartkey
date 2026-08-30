import { NextRequest, NextResponse } from 'next/server';
import * as z from 'zod';

import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

const DEFAULTS = {
  key_issued_in_app: true,
  overdue_email: true,
  weekend_decided_email: true,
  weekend_submitted_in_app: true,
  weekend_submitted_email: true,
  signature_mismatch_email: true,
  digest_email: false,
};

const bodySchema = z
  .object({
    key_issued_in_app: z.boolean().optional(),
    overdue_email: z.boolean().optional(),
    weekend_decided_email: z.boolean().optional(),
    weekend_submitted_in_app: z.boolean().optional(),
    weekend_submitted_email: z.boolean().optional(),
    signature_mismatch_email: z.boolean().optional(),
    digest_email: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'At least one preference field is required',
  });

export const GET = async () => {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });

  const { data: prefs, error } = await supabase
    .from('notification_preferences')
    .select(
      'key_issued_in_app, overdue_email, weekend_decided_email, weekend_submitted_in_app, weekend_submitted_email, signature_mismatch_email, digest_email'
    )
    .eq('profile_id', user.id)
    .maybeSingle();

  if (error)
    return NextResponse.json(err('Failed to load preferences', 500), {
      status: 500,
    });

  return NextResponse.json(ok(prefs ?? DEFAULTS), { status: 200 });
};

export const PATCH = async (request: NextRequest) => {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(err('Invalid request body', 422), {
      status: 422,
    });
  }

  const { error } = await supabase
    .from('notification_preferences')
    .upsert(
      { profile_id: user.id, ...parsed.data },
      { onConflict: 'profile_id' }
    );

  if (error)
    return NextResponse.json(err('Failed to save preferences', 500), {
      status: 500,
    });

  return NextResponse.json(ok(parsed.data), { status: 200 });
};
