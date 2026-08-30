'use server';

import { NextRequest, NextResponse } from 'next/server';
import * as z from 'zod';

import { verifySignature } from '@/lib/ai/signature/verifier';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { err, ok } from '@/types/api';

const bodySchema = z.object({
  hod_id: z.uuid(),
  submitted_signature_url: z.url(),
});

// Internal route — only callable from server-side code via the SUPABASE_SERVICE_ROLE_KEY header.
// Clients cannot supply this header; it never leaves the server environment.
const isAuthorised = (request: NextRequest): boolean =>
  request.headers.get('x-internal-secret') ===
  process.env.SUPABASE_SERVICE_ROLE_KEY;

export const POST = async (request: NextRequest) => {
  if (!isAuthorised(request)) {
    return NextResponse.json(err('Forbidden', 403), { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(err('Invalid request body', 422), { status: 422 });
  }

  const { hod_id, submitted_signature_url } = parsed.data;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('signature_ref_url')
    .eq('id', hod_id)
    .single();

  if (!profile?.signature_ref_url) {
    return NextResponse.json(
      err('HOD has not completed signature onboarding', 422),
      { status: 422 }
    );
  }

  let refBuffer: Buffer;
  let subBuffer: Buffer;

  try {
    const [refRes, subRes] = await Promise.all([
      fetch(profile.signature_ref_url),
      fetch(submitted_signature_url),
    ]);
    if (!refRes.ok || !subRes.ok) {
      throw new Error('Failed to fetch one or more signature images');
    }
    refBuffer = Buffer.from(await refRes.arrayBuffer());
    subBuffer = Buffer.from(await subRes.arrayBuffer());
  } catch (e) {
    const ref = crypto.randomUUID();
    logger.error('Signature image fetch failed', {
      ref,
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(err(`Image fetch failed. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  try {
    const result = await verifySignature(refBuffer, subBuffer);
    return NextResponse.json(ok(result));
  } catch (e) {
    const ref = crypto.randomUUID();
    logger.error('Signature verification failed', {
      ref,
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(err(`Verification error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }
};
