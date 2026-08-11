// Seeds a Dean (with a reference signature), a Requester, and a pending
// weekend request against the LOCAL Docker Supabase stack only. Re-runnable —
// deletes its own prior rows/users first. See ../README.md.
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import ws from 'ws';
import { SUPABASE_URL, SERVICE_ROLE_KEY } from './local-env.mjs';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
});

const W = 800;
const H = 400;
// Two visually distinct synthetic signatures — code-drawn, not anyone's real
// signature. SIG_B is guaranteed to fail verification against a SIG_A reference.
const SIG_A =
  'M60,260 C120,120 180,300 240,200 S360,80 420,240 C480,340 540,160 600,220 L740,190';
const SIG_B =
  'M80,180 C140,320 200,120 260,280 S380,340 440,160 C500,60 560,300 620,180 L720,260';

const strokeImage = (path) =>
  sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
         <rect width="100%" height="100%" fill="white"/>
         <path d="${path}" stroke="black" stroke-width="6" fill="none" stroke-linecap="round"/>
       </svg>`
    )
  )
    .png()
    .toBuffer();

const nextSaturday = () => {
  const d = new Date();
  const daysUntilSat = (6 - d.getUTCDay() + 7) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + daysUntilSat);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

export const seed = async () => {
  const [refUrl, subUrl] = await Promise.all([
    strokeImage(SIG_A).then((buf) =>
      admin.storage
        .from('hod-signatures')
        .upload('local-test/reference.png', buf, {
          contentType: 'image/png',
          upsert: true,
        })
    ),
    strokeImage(SIG_B).then((buf) =>
      admin.storage
        .from('hod-signatures')
        .upload('local-test/submitted-mismatch.png', buf, {
          contentType: 'image/png',
          upsert: true,
        })
    ),
  ]).then(() => [
    admin.storage
      .from('hod-signatures')
      .getPublicUrl('local-test/reference.png').data.publicUrl,
    admin.storage
      .from('hod-signatures')
      .getPublicUrl('local-test/submitted-mismatch.png').data.publicUrl,
  ]);

  const { data: eng } = await admin
    .from('units')
    .select('id')
    .eq('name', 'Faculty of Engineering')
    .single();
  const { data: key } = await admin
    .from('keys')
    .select('id')
    .eq('code', 'FENG-DEAN')
    .single();

  const emails = {
    dean: 'local-test-dean@example.com',
    cso: 'local-test-cso@example.com',
    requester: 'local-test-requester@example.com',
  };
  // Upsert, not delete-then-recreate: once a profile has been referenced by
  // an audit_log row (which the whole point of this test flow produces),
  // deleting it is permanently blocked by the append-only FK — by design.
  // Re-running this script must reuse the same users, not fight that.
  const { data: existingUsers } = await admin.auth.admin.listUsers();
  const users = {};
  for (const [roleKey, email] of Object.entries(emails)) {
    const found = existingUsers.users.find((u) => u.email === email);
    if (found) {
      users[roleKey] = found.id;
      continue;
    }
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password: 'Local-Test-Only-1!',
      email_confirm: true,
    });
    if (error) throw error;
    users[roleKey] = created.user.id;
  }

  await admin.from('profiles').upsert([
    {
      id: users.dean,
      role: 'DEAN',
      full_name: 'Local Test Dean',
      institutional_email: emails.dean,
      unit_id: eng.id,
      status: 'ACTIVE',
      signature_ref_url: refUrl,
      stamp_ref_url: refUrl,
    },
    {
      id: users.cso,
      role: 'CSO',
      full_name: 'Local Test CSO',
      institutional_email: emails.cso,
      status: 'ACTIVE',
    },
    {
      id: users.requester,
      role: 'REQUESTER',
      full_name: 'Local Test Requester',
      institutional_email: emails.requester,
      unit_id: eng.id,
      status: 'ACTIVE',
    },
  ]);

  const weekendDate = nextSaturday();
  const returnDeadline = new Date(weekendDate);
  returnDeadline.setUTCHours(17, 0, 0, 0);

  await admin.from('requests').delete().eq('requested_room', 'LOCAL_TEST_ROW');
  const { data: request, error: reqError } = await admin
    .from('requests')
    .insert({
      requester_id: users.requester,
      key_id: key.id,
      type: 'WEEKEND',
      requested_for: weekendDate.toISOString().slice(0, 10),
      return_deadline: returnDeadline.toISOString(),
      status: 'PENDING_HOD',
      risk_tier: 'LOW',
      risk_factors: [],
      requested_room: 'LOCAL_TEST_ROW',
    })
    .select('id')
    .single();
  if (reqError) throw reqError;

  return { requestId: request.id, refUrl, subUrl, emails };
};

if (process.argv[1] === new URL(import.meta.url).pathname) {
  seed().then(
    (result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    },
    (err) => {
      console.error(err);
      process.exit(1);
    }
  );
}
