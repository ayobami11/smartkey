#!/usr/bin/env node
/**
 * SmartKey post-deployment smoke test.
 *
 * Run against a freshly deployed URL to answer one question before that
 * deployment is promoted: "is this build actually serving the critical path?"
 *
 *   SMOKE_BASE_URL=https://smartkey-xyz.vercel.app \
 *   SMOKE_REQUESTER_EMAIL=... SMOKE_REQUESTER_PASSWORD=... \
 *   node tests/smoke/smoke.mjs
 *
 * Zero dependencies — Node 20+ built-ins only (global fetch, getSetCookie).
 *
 * ---------------------------------------------------------------------------
 * Two design decisions worth reading before you change anything here.
 * ---------------------------------------------------------------------------
 *
 * 1. MFA: we complete a REQUESTER login only, and assert on *shape* for the
 *    privileged roles.
 *
 *    CSO, DEAN and VERIFIER logins return `{ session: null, mfa_required: true }`
 *    and email a 6-digit code (see src/app/api/auth/login/route.ts). A smoke
 *    test cannot read an inbox, so completing those logins is impossible without
 *    either a test-only MFA bypass in production code (a real security hole for
 *    a permanent CI credential) or an IMAP integration (a second live dependency
 *    that will itself flake and page someone at 3am).
 *
 *    REQUESTER is the only MFA-exempt role, so it is the one that gives us a
 *    genuine authenticated session. For CSO we assert the MFA *contract* holds —
 *    HTTP 200, `mfa_required: true`, `session: null` — which still catches a
 *    broken auth deploy, a Supabase outage, or an accidental MFA regression.
 *    Note `email_delivery_failed: true` is NOT a login failure: SMTP delivery is
 *    deliberately non-blocking, so we log it as a warning and move on.
 *
 * 2. This test never mutates production state.
 *
 *    `POST /api/requests/collect` and `POST /api/keys/return` are VERIFIER-only
 *    and check the role *before* they parse the body or touch an RPC. Calling
 *    them unauthenticated (expect 401) and with a REQUESTER session (expect 403)
 *    proves the route is deployed, reachable, resolving the cookie namespace
 *    correctly and enforcing its role gate — without issuing or returning a real
 *    key, and so without leaving garbage rows and audit entries behind on every
 *    deploy. Actually completing an issue-and-return loop would need a VERIFIER
 *    session, which brings us back to point 1.
 *
 * ---------------------------------------------------------------------------
 * The trap that will cost you an afternoon (docs/postman/README.md)
 * ---------------------------------------------------------------------------
 *
 * Auth is cookie-based, not Bearer, and every authenticated `/api/*` call needs
 * a `Referer` header matching the role area. SmartKey stores each role's session
 * in its own cookie namespace; `/api/*` paths carry no role prefix, so the
 * Referer is the ONLY signal the server has for which namespace to read. Omit it
 * and you land on the empty `activate` namespace and get a 401 while
 * demonstrably logged in.
 */

const BASE_URL = (process.env.SMOKE_BASE_URL ?? '').replace(/\/+$/, '');
const REQUESTER_EMAIL = process.env.SMOKE_REQUESTER_EMAIL ?? '';
const REQUESTER_PASSWORD = process.env.SMOKE_REQUESTER_PASSWORD ?? '';
const CSO_EMAIL = process.env.SMOKE_CSO_EMAIL ?? '';
const CSO_PASSWORD = process.env.SMOKE_CSO_PASSWORD ?? '';
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 20000);

const REFERER = {
  cso: `${BASE_URL}/cso`,
  dean: `${BASE_URL}/dean`,
  verifier: `${BASE_URL}/verifier`,
  requester: `${BASE_URL}/requester`,
};

/* -------------------------------------------------------------------------- */
/* Tiny cookie jar                                                            */
/* -------------------------------------------------------------------------- */

const createJar = () => {
  const cookies = new Map();

  const absorb = (response) => {
    for (const raw of response.headers.getSetCookie()) {
      const [pair, ...attrs] = raw.split(';');
      const idx = pair.indexOf('=');
      if (idx < 1) continue;
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();

      const expired = attrs.some((a) => {
        const [k, v] = a.split('=').map((s) => (s ?? '').trim().toLowerCase());
        if (k === 'max-age') return Number(v) <= 0;
        if (k === 'expires') return new Date(v).getTime() <= Date.now();
        return false;
      });

      if (expired || value === '') cookies.delete(name);
      else cookies.set(name, value);
    }
  };

  const header = () =>
    [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

  return { absorb, header, size: () => cookies.size };
};

/* -------------------------------------------------------------------------- */
/* HTTP                                                                       */
/* -------------------------------------------------------------------------- */

const call = async (method, path, { body, referer, jar } = {}) => {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (referer) headers.Referer = referer;
  if (jar && jar.size() > 0) headers.Cookie = jar.header();

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (jar) jar.absorb(response);

  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON (HTML page, empty 204) — leave json null */
  }

  return { status: response.status, json, text, response };
};

/* -------------------------------------------------------------------------- */
/* Runner                                                                     */
/* -------------------------------------------------------------------------- */

const results = [];
const log = (line) => process.stdout.write(`${line}\n`);

const check = async (name, fn) => {
  const started = Date.now();
  try {
    await fn();
    const ms = Date.now() - started;
    results.push({ name, ok: true, ms });
    log(`  PASS  ${name} (${ms}ms)`);
  } catch (error) {
    const ms = Date.now() - started;
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, ms, message });
    log(`  FAIL  ${name} (${ms}ms)\n        ${message}`);
  }
};

const skip = (name, why) => {
  results.push({ name, ok: true, skipped: true });
  log(`  SKIP  ${name} — ${why}`);
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const assertStatus = (result, expected, label) =>
  assert(
    result.status === expected,
    `${label}: expected HTTP ${expected}, got ${result.status}. Body: ${result.text.slice(0, 300)}`
  );

// Every route returns { data, error, status } (src/types/api.ts).
const assertEnvelope = (result, label) => {
  assert(result.json !== null, `${label}: response body was not JSON`);
  assert(
    'data' in result.json && 'error' in result.json && 'status' in result.json,
    `${label}: response is not the { data, error, status } envelope`
  );
};

/* -------------------------------------------------------------------------- */
/* Checks                                                                     */
/* -------------------------------------------------------------------------- */

const run = async () => {
  if (!BASE_URL) {
    log('SMOKE_BASE_URL is not set. Nothing to test against.');
    process.exit(2);
  }
  if (!REQUESTER_EMAIL || !REQUESTER_PASSWORD) {
    log(
      'SMOKE_REQUESTER_EMAIL / SMOKE_REQUESTER_PASSWORD are not set.\n' +
        'The requester account is the only MFA-exempt login, so without it the\n' +
        'smoke test cannot authenticate at all. Configure the secrets.'
    );
    process.exit(2);
  }

  log(`SmartKey smoke test against ${BASE_URL}\n`);

  const jar = createJar();

  /* -- 1. The app is up ---------------------------------------------------- */

  log('App reachability');

  await check('GET / serves the landing page', async () => {
    const res = await call('GET', '/');
    assert(
      res.status >= 200 && res.status < 400,
      `expected a 2xx/3xx from /, got ${res.status}`
    );
  });

  /* -- 2. Auth ------------------------------------------------------------- */

  log('\nPOST /api/auth/login');

  await check('rejects bad credentials with 401', async () => {
    const res = await call('POST', '/api/auth/login', {
      body: {
        email: REQUESTER_EMAIL,
        password: `definitely-not-the-password-${Date.now()}`,
      },
    });
    assertEnvelope(res, 'bad-credential login');
    assertStatus(res, 401, 'bad-credential login');
  });

  await check('signs in the requester (MFA-exempt role)', async () => {
    const res = await call('POST', '/api/auth/login', {
      body: { email: REQUESTER_EMAIL, password: REQUESTER_PASSWORD },
      jar,
    });
    assertEnvelope(res, 'requester login');
    assertStatus(res, 200, 'requester login');

    const data = res.json.data;
    assert(
      data?.role === 'REQUESTER',
      `expected role REQUESTER, got ${data?.role}`
    );
    assert(
      data?.mfa_required === false,
      'REQUESTER should be exempt from MFA — mfa_required was truthy'
    );
    assert(data?.session, 'no session returned for the requester login');
    assert(jar.size() > 0, 'no session cookie was set on the response');
  });

  if (CSO_EMAIL && CSO_PASSWORD) {
    await check('challenges the CSO for MFA (shape only)', async () => {
      // Deliberately NOT given the jar: this login must not clobber the
      // requester session used by the checks below.
      const res = await call('POST', '/api/auth/login', {
        body: { email: CSO_EMAIL, password: CSO_PASSWORD },
      });
      assertEnvelope(res, 'CSO login');
      assertStatus(res, 200, 'CSO login');

      const data = res.json.data;
      assert(data?.mfa_required === true, 'CSO login did not require MFA');
      assert(
        data?.session === null,
        'CSO login returned a usable session before MFA was cleared'
      );
      // Non-blocking by design: SMTP failure must not fail the login.
      if (data?.email_delivery_failed === true) {
        log(
          '        warning: OTP email delivery failed (login itself is fine)'
        );
      }
    });
  } else {
    skip(
      'challenges the CSO for MFA (shape only)',
      'SMOKE_CSO_EMAIL / SMOKE_CSO_PASSWORD not configured'
    );
  }

  /* -- 3. Authenticated read path ------------------------------------------ */

  log('\nAuthenticated read path');

  // The deepest read we can genuinely perform: session cookie + correct Referer
  // + an RLS-scoped Postgres query. If this passes, auth, the cookie namespace
  // resolution and the database round-trip are all working on this deployment.
  await check(
    'GET /api/requests/my returns the requester history',
    async () => {
      const res = await call('GET', '/api/requests/my', {
        referer: REFERER.requester,
        jar,
      });
      assertEnvelope(res, 'requests/my');
      assertStatus(res, 200, 'requests/my');
      assert(
        Array.isArray(res.json.data?.requests),
        'expected data.requests to be an array'
      );
    }
  );

  // Regression guard for the Referer trap: without it the server resolves the
  // empty `activate` namespace and 401s. If this ever starts returning 200 the
  // namespace isolation has broken.
  await check(
    'GET /api/requests/my without a Referer resolves no session (401)',
    async () => {
      const res = await call('GET', '/api/requests/my', { jar });
      assertStatus(res, 401, 'requests/my without Referer');
    }
  );

  /* -- 4. Critical verifier routes (role gate only — no mutation) ----------- */

  log('\nVerifier critical path (role gate, no state mutation)');

  const verifierRoutes = [
    {
      label: 'GET /api/requests/live-queue',
      method: 'GET',
      path: '/api/requests/live-queue',
    },
    {
      label: 'POST /api/requests/collect',
      method: 'POST',
      path: '/api/requests/collect',
      // Never a real code: the role gate rejects before the body is parsed, so
      // this can never issue a key even if the gate were removed by accident.
      body: { code: '000000' },
    },
    {
      label: 'POST /api/keys/return',
      method: 'POST',
      path: '/api/keys/return',
      body: {
        request_id: '00000000-0000-0000-0000-000000000000',
        override_reason: 'smoke test — must never reach the RPC',
      },
    },
  ];

  for (const route of verifierRoutes) {
    await check(
      `${route.label} is deployed and rejects anonymous callers (401)`,
      async () => {
        const res = await call(route.method, route.path, {
          body: route.body,
          referer: REFERER.verifier,
        });
        assertEnvelope(res, route.label);
        assertStatus(res, 401, route.label);
      }
    );

    await check(
      `${route.label} rejects a non-verifier session (403)`,
      async () => {
        const res = await call(route.method, route.path, {
          body: route.body,
          referer: REFERER.requester,
          jar,
        });
        assertEnvelope(res, route.label);
        assertStatus(res, 403, route.label);
      }
    );
  }

  /* -- Summary ------------------------------------------------------------- */

  const failed = results.filter((r) => !r.ok);
  const skipped = results.filter((r) => r.skipped);

  log(
    `\n${results.length - failed.length - skipped.length} passed, ` +
      `${failed.length} failed, ${skipped.length} skipped`
  );

  if (failed.length > 0) {
    log('\nSmoke test FAILED. This deployment should not be promoted.');
    for (const f of failed) log(`  - ${f.name}: ${f.message}`);
    process.exit(1);
  }

  log('\nSmoke test passed.');
};

run().catch((error) => {
  log(`\nSmoke test crashed: ${error instanceof Error ? error.stack : error}`);
  process.exit(1);
});
