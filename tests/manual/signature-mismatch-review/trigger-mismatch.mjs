// Mints a real session for a local test user with no email round trip (admin
// generateLink + verifyOtp), replayed through the app's own @supabase/ssr
// client so the resulting cookies match a real browser login byte-for-byte.
// Exports mintSessionCookies() for reuse, and — run directly — POSTs to
// /api/requests/hod-decision as the Dean to produce a real
// HELD_SIGNATURE_MISMATCH. Requires `npm run dev` running against the local
// stack (see ../README.md).
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import ws from 'ws';
import { SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY } from './local-env.mjs';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
});
const anon = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
});

// Matches cookieNameForNamespace in src/lib/supabase/cookies.ts:
// `sb-<projectRef>-<namespace>`, projectRef = first path segment of the host.
const cookieName = (ns) => `sb-127-${ns}`;

export const mintSessionCookies = async (email, namespace) => {
  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkError) throw linkError;

  const { data: otpData, error: otpError } = await anon.auth.verifyOtp({
    type: 'magiclink',
    token_hash: linkData.properties.hashed_token,
  });
  if (otpError) throw otpError;

  const jar = [];
  const ssrClient = createServerClient(SUPABASE_URL, ANON_KEY, {
    cookieOptions: { name: cookieName(namespace) },
    cookies: { getAll: () => [], setAll: (toSet) => jar.push(...toSet) },
    realtime: { transport: ws },
  });
  await ssrClient.auth.setSession({
    access_token: otpData.session.access_token,
    refresh_token: otpData.session.refresh_token,
  });

  return jar.map(({ name, value }) => `${name}=${encodeURIComponent(value)}`);
};

const main = async () => {
  const requestId = process.argv[2];
  const subUrl = process.argv[3];
  if (!requestId || !subUrl) {
    console.error('usage: node trigger-mismatch.mjs <requestId> <subUrl>');
    process.exit(1);
  }

  const cookies = await mintSessionCookies(
    'local-test-dean@example.com',
    'dean'
  );

  const res = await fetch('http://localhost:3000/api/requests/hod-decision', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookies.join('; '),
      referer: 'http://localhost:3000/dean/weekend-requests',
    },
    body: JSON.stringify({
      request_id: requestId,
      decision: 'APPROVED',
      submitted_signature_url: subUrl,
    }),
  });

  console.log('status:', res.status);
  console.log(await res.text());
};

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().then(
    () => process.exit(0),
    (err) => {
      console.error(err);
      process.exit(1);
    }
  );
}
