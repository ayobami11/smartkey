import type { NextRequest } from 'next/server';
import * as z from 'zod';

import { verifySignature } from '@/lib/ai/signature/verifier';
import { respond } from '@/lib/http/respond';
import { route, type RouteHandler, secretMatches } from '@/lib/http/route';
import { logger } from '@/lib/logger';
import {
  downloadStorageObject,
  parseStorageUrl,
} from '@/lib/storage/object-url';
import { createAdminClient } from '@/lib/supabase/admin';

// Diagnostic / calibration endpoint: runs the signature pipeline over HTTP
// (e.g. from Postman). Nothing in the app calls it — the weekend decision
// module runs verifySignature() in-process. It is therefore disabled unless
// SIGNATURE_DIAGNOSTIC_SECRET is set, and production should leave it unset.
//
// The secret is dedicated to this route. It used to be the service-role key,
// which meant the one credential that bypasses all RLS was sent as an HTTP
// header and compared with `===`.

const SECRET_ENV = 'SIGNATURE_DIAGNOSTIC_SECRET';
const SECRET_HEADER = 'x-internal-secret';

// A short value is treated as unset: this route bypasses RLS to read any
// Dean's reference, so a guessable secret is as good as none.
const MIN_SECRET_LENGTH = 32;

// The submitted image may only be a letter/stamp upload or a signature
// reference. downloadStorageObject already refuses anything that is not an
// object in a proxied bucket (it never fetches an arbitrary URL), but that
// set includes passport-photos, which this route has no business reading.
const VERIFIABLE_BUCKETS: ReadonlySet<string> = new Set([
  'weekend-letters',
  'hod-signatures',
]);

const bodySchema = z.object({
  hod_id: z.uuid(),
  submitted_signature_url: z.string().refine((url) => {
    const ref = parseStorageUrl(url);
    return ref !== null && VERIFIABLE_BUCKETS.has(ref.bucket);
  }),
});

const NAME = 'ai/verify-signature';

const diagnosticAuth = (request: NextRequest) => {
  const secret = process.env[SECRET_ENV] ?? '';
  // Fail closed: unset (or too short) means the route is switched off. Same
  // 403 as a wrong secret, so a caller cannot tell which case they hit.
  if (secret.length < MIN_SECRET_LENGTH) {
    return respond.fail(403, 'Forbidden');
  }
  const provided = request.headers.get(SECRET_HEADER) ?? '';
  if (!secretMatches(provided, secret)) {
    return respond.fail(403, 'Forbidden');
  }
  return null;
};

const handle = route({
  name: NAME,
  // 'public' only in the sense of "no Supabase session": diagnosticAuth
  // has already checked the shared secret before route() runs.
  auth: 'public',
  body: bodySchema,
  handler: async ({ body }) => {
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('signature_ref_url')
      .eq('id', body.hod_id)
      .single();

    if (!profile?.signature_ref_url) {
      return respond.fail(422, 'Dean has not completed signature onboarding');
    }

    let refBuffer: Buffer;
    let subBuffer: Buffer;
    try {
      // Both buckets are private — download through the Storage API rather
      // than fetching the stored URL over HTTP.
      [refBuffer, subBuffer] = await Promise.all([
        downloadStorageObject(admin, profile.signature_ref_url),
        downloadStorageObject(admin, body.submitted_signature_url),
      ]);
    } catch (e) {
      return respond.internal(`${NAME}: image fetch failed`, {
        err: e instanceof Error ? e.message : String(e),
      });
    }

    const result = await verifySignature(refBuffer, subBuffer);
    logger.info(`${NAME}: diagnostic comparison run`, {
      hod_id: body.hod_id,
      passed: result.passed,
    });
    return respond.ok(result);
  },
});

export const POST: RouteHandler = async (request, context) =>
  diagnosticAuth(request) ?? handle(request, context);
