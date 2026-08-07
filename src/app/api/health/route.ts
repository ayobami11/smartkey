import { NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

/**
 * Liveness probe for external uptime monitoring (UptimeRobot).
 *
 * The point of this route is the one thing `/` cannot do: fail when the
 * database is unreachable. The landing page is statically rendered and returns
 * 200 with Postgres completely down, so a monitor pointed at it shows green
 * through a total outage. This route issues a real query and reports 503 when
 * that query cannot complete.
 *
 * Deliberate choices:
 *
 * - **No auth.** A prober cannot hold a session, and gating this would mean the
 *   monitor tests the auth stack rather than availability.
 * - **Anon client, never the service role.** This is a public, unauthenticated
 *   route; putting a service-role key behind one is how RLS gets bypassed by
 *   accident. The query below is expected to return zero rows for anon — that
 *   is a pass, not a failure. See the RLS note on the query itself.
 * - **No counts, no identifiers, no row data.** The response says whether the
 *   system is up. Anything more is an unauthenticated information leak, and an
 *   outage is precisely when people scrape whatever is still answering.
 */

// A cached health check reports the health of the cache. Both directives are
// needed: `force-dynamic` opts out of static rendering at build time,
// `revalidate = 0` prevents the result being reused between requests.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Slow is a different failure from down, and a monitor that only sees 200/503
// cannot tell you the database is degrading until it stops. Reported in the
// body so UptimeRobot's keyword check can alert on it if you want it to.
const SLOW_MS = 1000;

export const GET = async () => {
  const startedAt = Date.now();

  try {
    const supabase = await createServerClient();

    // RLS denies anon on `keys`, so this returns an empty array — which is the
    // healthy outcome. It still proves the full path is alive: PostgREST parsed
    // the request and Postgres executed the policy check to decide on those
    // zero rows. `error` is populated only when the round trip genuinely fails.
    // `head: true` asks for no body at all, making this about as cheap as a
    // query gets at a 5-minute cadence.
    const { error } = await supabase
      .from('keys')
      .select('id', { head: true, count: 'exact' })
      .limit(1);

    const latencyMs = Date.now() - startedAt;

    if (error) {
      // The message may carry connection details, so it goes to the log, not
      // the response body.
      logger.error('Health check failed', {
        err: error.message,
        latencyMs,
      });

      return NextResponse.json(err('Database unreachable', 503), {
        status: 503,
      });
    }

    if (latencyMs > SLOW_MS) {
      logger.warn('Health check slow', { latencyMs, thresholdMs: SLOW_MS });
    }

    return NextResponse.json(
      ok({
        status: latencyMs > SLOW_MS ? 'degraded' : 'ok',
        database: 'up',
        latency_ms: latencyMs,
        timestamp: new Date().toISOString(),
      }),
      { status: 200 }
    );
  } catch (caught) {
    // createServerClient throws when Supabase env vars are missing — a
    // misconfigured deploy, which is exactly the case a health check exists to
    // catch. Without this the route would 500 with a Next.js error page rather
    // than a parseable envelope.
    const latencyMs = Date.now() - startedAt;

    logger.error('Health check threw', {
      err: caught instanceof Error ? caught.message : String(caught),
      latencyMs,
    });

    return NextResponse.json(err('Health check failed', 503), { status: 503 });
  }
};
