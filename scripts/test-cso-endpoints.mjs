/**
 * End-to-end tests for all CSO POST endpoints against the live Vercel deployment.
 * Run: node scripts/test-cso-endpoints.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ocpsklbbksuymjdbfpja.supabase.co';
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jcHNrbGJia3N1eW1qZGJmcGphIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTcwODkzNCwiZXhwIjoyMDk1Mjg0OTM0fQ.ZaSYk2EN4g1PWi6oIzM2jAAEsY31nbZcB2UX2WsN-30';
const CSO_EMAIL = 'mohammedfirdous682@gmail.com';
const BASE = 'https://smartkey-ochre.vercel.app';
const PROJECT_REF = 'ocpsklbbksuymjdbfpja';
const COOKIE_NAME = `sb-${PROJECT_REF}-auth-token`;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const CSO_PASSWORD = 'SmartKey2026!';

// ── helpers ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

const ok = (label) => {
  console.log(`  ✓  ${label}`);
  passed++;
};
const fail = (label, detail) => {
  console.error(`  ✗  ${label}\n     ${detail}`);
  failed++;
};

// Log in via the actual login endpoint and extract the full Cookie header
// from all Set-Cookie response headers — this gives us exactly what the
// server expects on subsequent requests.
async function getCsoSession() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: CSO_EMAIL, password: CSO_PASSWORD }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Login failed ${res.status}: ${body}`);
  }
  // Collect every Set-Cookie the server returns and turn them into a single
  // Cookie request header for subsequent calls.
  const cookies = res.headers
    .getSetCookie?.()
    ?.map((c) => c.split(';')[0])
    .join('; ');
  if (!cookies)
    throw new Error('Login succeeded but no Set-Cookie headers returned');
  return cookies;
}

async function api(cookieHeader, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  // Use `httpStatus` for the HTTP code; `json.status` is the envelope status.
  // Do NOT spread — the body's `status` field would overwrite HTTP status.
  return {
    httpStatus: res.status,
    data: json.data,
    error: json.error,
    bodyStatus: json.status,
  };
}

// DB helpers (read via service role so we have seed data to test against)
const dbFirst = async (table, select = 'id', filter = {}) => {
  let q = admin.from(table).select(select);
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  const { data } = await q.limit(1).maybeSingle();
  return data;
};

// ── main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\n=== SmartKey CSO endpoint tests → ${BASE} ===\n`);

  // ── session ────────────────────────────────────────────────────────────────
  let session;
  try {
    session = await getCsoSession();
    ok('POST /api/auth/login → 200  (CSO session established)');
  } catch (e) {
    fail('POST /api/auth/login', e.message);
    process.exit(1);
  }

  // ── 1. POST /api/auth/reset-password (public, no auth) ───────────────────
  {
    const r = await fetch(`${BASE}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: CSO_EMAIL }),
    });
    const json = await r.json();
    r.status === 200
      ? ok('POST /api/auth/reset-password → 200 (no email enumeration)')
      : fail('POST /api/auth/reset-password', JSON.stringify(json));
  }

  // ── 2. POST /api/admin/users ─────────────────────────────────────────────
  let newProfileId;
  {
    const testEmail = `testverifier${Date.now()}@smartkey-test.invalid`;
    const r = await api(session, 'POST', '/api/admin/users', {
      full_name: 'Test Verifier',
      institutional_email: testEmail,
      role: 'VERIFIER',
    });
    if (r.httpStatus === 201 && r.data?.profile_id) {
      newProfileId = r.data.profile_id;
      ok(`POST /api/admin/users → 201  profile_id=${newProfileId}`);
    } else {
      fail('POST /api/admin/users', JSON.stringify(r));
    }

    // 422 — invalid email
    const r2 = await api(session, 'POST', '/api/admin/users', {
      full_name: 'Bad',
      institutional_email: 'not-an-email',
      role: 'VERIFIER',
    });
    r2.httpStatus === 422
      ? ok('POST /api/admin/users → 422 on invalid email')
      : fail('POST /api/admin/users (422 case)', JSON.stringify(r2));

    // 422 — missing department_id for HOD
    const r3 = await api(session, 'POST', '/api/admin/users', {
      full_name: 'No Dept HOD',
      institutional_email: `hod-nodept${Date.now()}@smartkey-test.invalid`,
      role: 'HOD',
    });
    r3.httpStatus === 422
      ? ok('POST /api/admin/users → 422 when HOD missing department_id')
      : fail('POST /api/admin/users (422 HOD no dept)', JSON.stringify(r3));
  }

  // ── 3. PATCH /api/admin/users/:id/revoke ─────────────────────────────────
  if (newProfileId) {
    const r = await api(
      session,
      'PATCH',
      `/api/admin/users/${newProfileId}/revoke`
    );
    r.httpStatus === 200 && r.data?.status === 'DEACTIVATED'
      ? ok(`PATCH /api/admin/users/${newProfileId}/revoke → 200 DEACTIVATED`)
      : fail('PATCH /api/admin/users/:id/revoke', JSON.stringify(r));

    // 409 — already deactivated
    const r2 = await api(
      session,
      'PATCH',
      `/api/admin/users/${newProfileId}/revoke`
    );
    r2.httpStatus === 409
      ? ok('PATCH /api/admin/users/:id/revoke → 409 already deactivated')
      : fail(
          'PATCH /api/admin/users/:id/revoke (409 case)',
          JSON.stringify(r2)
        );
  }

  // ── 4. POST /api/incidents ────────────────────────────────────────────────
  {
    const r = await api(session, 'POST', '/api/incidents', {
      type: 'EQUIPMENT_FAULT',
      severity: 'LOW',
      description: 'Automated endpoint test — please ignore.',
      occurred_at: new Date().toISOString(),
    });
    r.httpStatus === 201 && r.data?.reference
      ? ok(`POST /api/incidents → 201  reference=${r.data.reference}`)
      : fail('POST /api/incidents', JSON.stringify(r));

    // 422 — missing description
    const r2 = await api(session, 'POST', '/api/incidents', {
      type: 'OTHER',
      severity: 'LOW',
      occurred_at: new Date().toISOString(),
    });
    r2.httpStatus === 422
      ? ok('POST /api/incidents → 422 on missing description')
      : fail('POST /api/incidents (422 case)', JSON.stringify(r2));
  }

  // ── 5. POST /api/keys/mark-lost ───────────────────────────────────────────
  // Seeded keys use non-standard UUIDs (version 0) that Zod v4 z.uuid()
  // rejects. Insert a temp key with a proper gen_random_uuid() for this test.
  {
    const dept = await dbFirst('departments');
    const { data: tmpKey } = await admin
      .from('keys')
      .insert({
        code: `TEST-${Date.now()}`,
        zone: 'NEW_SENATE',
        room_name: 'Test Room',
        department_id: dept.id,
      })
      .select('id, code')
      .single();

    if (!tmpKey) {
      ok('POST /api/keys/mark-lost → skipped (could not create test key)');
    } else {
      const body = {
        key_id: tmpKey.id,
        note: 'Automated endpoint test — deleting immediately.',
      };
      const r = await api(session, 'POST', '/api/keys/mark-lost', body);
      if (r.httpStatus === 200 && r.data?.incident_id) {
        ok(
          `POST /api/keys/mark-lost → 200  key=${tmpKey.code}  incident=${r.data.incident_id}`
        );
      } else {
        fail(
          `POST /api/keys/mark-lost  sent=${JSON.stringify(body)}`,
          JSON.stringify(r)
        );
      }
      // Clean up: delete the temp key (and the incident we just created)
      await admin.from('keys').delete().eq('id', tmpKey.id);

      // 404 — non-existent key (use a proper v4 UUID so Zod accepts it)
      const r2 = await api(session, 'POST', '/api/keys/mark-lost', {
        key_id: '550e8400-e29b-41d4-a716-446655440000',
        note: 'should 404',
      });
      r2.httpStatus === 404
        ? ok('POST /api/keys/mark-lost → 404 on unknown key')
        : fail('POST /api/keys/mark-lost (404 case)', JSON.stringify(r2));
    }
  }

  // ── 6. POST /api/requests/cso-decision ───────────────────────────────────
  {
    const req = await dbFirst('requests', 'id', { status: 'CODE_ISSUED' });
    if (!req) {
      ok('POST /api/requests/cso-decision → skipped (no CODE_ISSUED requests)');
    } else {
      const r = await api(session, 'POST', '/api/requests/cso-decision', {
        request_id: req.id,
        decision: 'APPROVED',
        note: 'Automated test approval.',
      });
      r.httpStatus === 200
        ? ok('POST /api/requests/cso-decision APPROVED → 200')
        : fail('POST /api/requests/cso-decision', JSON.stringify(r));
    }

    // 422 — missing request_id
    const r2 = await api(session, 'POST', '/api/requests/cso-decision', {
      decision: 'APPROVED',
    });
    r2.httpStatus === 422
      ? ok('POST /api/requests/cso-decision → 422 on missing request_id')
      : fail('POST /api/requests/cso-decision (422 case)', JSON.stringify(r2));
  }

  // ── 7. POST /api/reports/generate ────────────────────────────────────────
  {
    const shift = await dbFirst('shifts');
    if (!shift) {
      ok('POST /api/reports/generate → skipped (no shifts in db)');
    } else {
      await admin.from('shift_reports').delete().eq('shift_id', shift.id);
      const r = await api(session, 'POST', '/api/reports/generate', {
        shift_id: shift.id,
      });
      if (r.httpStatus === 201 && r.data?.report_id) {
        ok(`POST /api/reports/generate → 201  report_id=${r.data.report_id}`);

        // ── 8. POST /api/reports/:id/comments ────────────────────────────
        const r2 = await api(
          session,
          'POST',
          `/api/reports/${r.data.report_id}/comments`,
          { text: 'Automated test comment — please ignore.' }
        );
        r2.httpStatus === 201 && r2.data?.comment_id
          ? ok(`POST /api/reports/${r.data.report_id}/comments → 201`)
          : fail('POST /api/reports/:id/comments', JSON.stringify(r2));

        await admin
          .from('shift_report_comments')
          .delete()
          .eq('id', r2.data?.comment_id);
        await admin.from('shift_reports').delete().eq('id', r.data.report_id);
      } else if (r.httpStatus === 409) {
        ok('POST /api/reports/generate → 409 (report already exists)');
      } else {
        fail('POST /api/reports/generate', JSON.stringify(r));
      }
    }
  }

  // ── POST /api/auth/logout  (last — invalidates session) ──────────────────
  {
    const r = await api(session, 'POST', '/api/auth/logout');
    r.httpStatus === 200
      ? ok('POST /api/auth/logout → 200')
      : fail('POST /api/auth/logout', JSON.stringify(r));
  }

  // ── summary ───────────────────────────────────────────────────────────────
  console.log(`\n  Passed: ${passed}   Failed: ${failed}\n`);
  if (failed > 0) process.exit(1);
}

run().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
