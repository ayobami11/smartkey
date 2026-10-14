// @vitest-environment node
// Contract for the cron/* routes: the bearer-secret gate, every query-failure
// branch, the counters each route reports to pg_cron, which rows get stamped
// (the idempotency the schedulers rely on), per-row failure handling and the
// per-run caps. Written against the routes before they moved onto route();
// kept as the regression net after.
import { put } from '@vercel/blob';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as auditExport } from '@/app/api/cron/audit-export/route';
import { POST as dailyDigest } from '@/app/api/cron/daily-digest/route';
import { POST as overdueReminders } from '@/app/api/cron/overdue-reminders/route';
import { POST as shiftReport } from '@/app/api/cron/shift-report/route';
import { POST as weekendReminders } from '@/app/api/cron/weekend-reminders/route';
import { fillShiftReport } from '@/lib/ai/reports/generate';
import { gmailTransport } from '@/lib/email/transport';
import { logger } from '@/lib/logger';
import { notify, type DeliveryOutcome } from '@/lib/notifications/notify';

import {
  type Op,
  call,
  expectRef,
  failure,
  fake,
  resetFake,
  success,
} from '../http/contract-harness';

vi.mock('@/lib/supabase/admin', async () => {
  const h = await import('../http/contract-harness');
  return { createAdminClient: () => h.makeClient('admin') };
});
vi.mock('@/lib/notifications/notify', () => ({ notify: vi.fn() }));
vi.mock('@/lib/ai/reports/generate', () => ({ fillShiftReport: vi.fn() }));
vi.mock('@vercel/blob', () => ({ put: vi.fn() }));
vi.mock('@/lib/email/transport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/email/transport')>()),
  gmailTransport: { send: vi.fn() },
}));

const SECRET = 'cron-secret-for-tests';

/** A pg_cron call: POST, no body, `Authorization: Bearer <secret>`. */
const cron = (path: string, authorization: string | null) =>
  new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: authorization === null ? {} : { authorization },
  });

const authed = (path: string) => cron(path, `Bearer ${SECRET}`);

// Today a throw escapes the hand-rolled handler, so Next answers with a bare
// 500 and no envelope or ref.
const expectUncaught = async (handler: unknown, path: string) => {
  await expect(call(handler, authed(path))).rejects.toThrow('boom');
};

const has = (ops: Op[], method: string) => ops.some(([m]) => m === method);
const argsOf = (ops: Op[], method: string) =>
  ops.filter(([m]) => m === method).map(([, args]) => args);

const queriesOn = (table: string) =>
  fake.queries.filter((q) => q.table === table);
const updatesOn = (table: string) =>
  queriesOn(table).filter((q) => has(q.ops, 'update'));

beforeEach(() => {
  resetFake();
  vi.stubEnv('CRON_SECRET', SECRET);
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'blob-token');
  vi.mocked(notify).mockReset();
  vi.mocked(fillShiftReport).mockReset();
  vi.mocked(put).mockReset();
  vi.mocked(gmailTransport.send).mockReset();
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
  vi.spyOn(logger, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// The bearer-secret gate, identical on every cron route
// ---------------------------------------------------------------------------

const ROUTES = [
  ['weekend-reminders', weekendReminders],
  ['overdue-reminders', overdueReminders],
  ['daily-digest', dailyDigest],
  ['shift-report', shiftReport],
  ['audit-export', auditExport],
] as const;

for (const [name, handler] of ROUTES) {
  const path = `/api/cron/${name}`;

  describe(`POST ${path} auth`, () => {
    it('401 Unauthorized with no Authorization header, before any query', async () => {
      expect(await call(handler, cron(path, null))).toEqual(
        failure(401, 'Unauthorized')
      );
      expect(fake.queries).toHaveLength(0);
    });

    it('401 Unauthorized with the wrong secret', async () => {
      expect(await call(handler, cron(path, 'Bearer not-it'))).toEqual(
        failure(401, 'Unauthorized')
      );
      expect(fake.queries).toHaveLength(0);
    });

    it('401 Unauthorized with the secret but no Bearer scheme', async () => {
      expect(await call(handler, cron(path, SECRET))).toEqual(
        failure(401, 'Unauthorized')
      );
    });

    it('401 Unauthorized with a prefix of the secret', async () => {
      expect(
        await call(handler, cron(path, `Bearer ${SECRET.slice(0, -1)}`))
      ).toEqual(failure(401, 'Unauthorized'));
    });

    it('ref’d 500 when CRON_SECRET is unset, before any query', async () => {
      vi.stubEnv('CRON_SECRET', '');
      expectRef(await call(handler, authed(path)));
      expect(fake.queries).toHaveLength(0);
    });

    it('an unset CRON_SECRET never authorises an empty bearer', async () => {
      vi.stubEnv('CRON_SECRET', '');
      const res = await call(handler, cron(path, 'Bearer '));
      expectRef(res);
    });
  });
}

// ---------------------------------------------------------------------------
// POST /api/cron/weekend-reminders
// ---------------------------------------------------------------------------

describe('POST /api/cron/weekend-reminders', () => {
  const path = '/api/cron/weekend-reminders';
  const due = (ids: string[], stampError: string | null = null) => {
    fake.tables.requests = (ops) =>
      has(ops, 'update')
        ? { data: null, error: stampError ? { message: stampError } : null }
        : { data: ids.map((id) => ({ id })), error: null };
  };
  const outcomes = (...list: DeliveryOutcome[]) => {
    for (const o of list) vi.mocked(notify).mockResolvedValueOnce(o);
  };

  it("selects APPROVED weekend requests due today that haven't been reminded", async () => {
    due([]);
    await call(weekendReminders, authed(path));
    const [select] = queriesOn('requests');
    expect(select.client).toBe('admin');
    const today = new Date().toISOString().slice(0, 10);
    expect(argsOf(select.ops, 'eq')).toEqual([
      ['type', 'WEEKEND'],
      ['status', 'APPROVED'],
      ['requested_for', today],
    ]);
    expect(argsOf(select.ops, 'is')).toEqual([['reminder_sent_at', null]]);
  });

  it('ref’d 500 when the query fails, without the DB text', async () => {
    fake.tables.requests = {
      data: null,
      error: { message: 'relation "requests" leaked' },
    };
    const res = await call(weekendReminders, authed(path));
    expectRef(res);
    expect(JSON.stringify(res.body)).not.toContain('leaked');
    expect(notify).not.toHaveBeenCalled();
  });

  it('nothing due → { sent: 0, failed: 0 }, no sends, no stamp', async () => {
    due([]);
    expect(await call(weekendReminders, authed(path))).toEqual(
      success({ sent: 0, failed: 0 })
    );
    expect(notify).not.toHaveBeenCalled();
    expect(updatesOn('requests')).toHaveLength(0);
  });

  it('null data is treated as nothing due', async () => {
    fake.tables.requests = { data: null, error: null };
    expect(await call(weekendReminders, authed(path))).toEqual(
      success({ sent: 0, failed: 0 })
    );
  });

  it('sends one WEEKEND_REMINDER per row and stamps only the sent ones', async () => {
    due(['a', 'b', 'c', 'd']);
    outcomes('sent', 'failed', 'suppressed', 'sent');
    expect(await call(weekendReminders, authed(path))).toEqual(
      success({ sent: 2, failed: 2 })
    );
    expect(vi.mocked(notify).mock.calls.map(([e]) => e)).toEqual([
      { type: 'WEEKEND_REMINDER', requestId: 'a' },
      { type: 'WEEKEND_REMINDER', requestId: 'b' },
      { type: 'WEEKEND_REMINDER', requestId: 'c' },
      { type: 'WEEKEND_REMINDER', requestId: 'd' },
    ]);
    const [stamp] = updatesOn('requests');
    expect(stamp.client).toBe('admin');
    const [[patch]] = argsOf(stamp.ops, 'update') as [
      [{ reminder_sent_at: string }],
    ];
    expect(Object.keys(patch)).toEqual(['reminder_sent_at']);
    expect(Number.isNaN(Date.parse(patch.reminder_sent_at))).toBe(false);
    expect(argsOf(stamp.ops, 'in')).toEqual([['id', ['a', 'd']]]);
  });

  it('a no_recipient outcome counts as failed and is not stamped', async () => {
    due(['a']);
    outcomes('no_recipient');
    expect(await call(weekendReminders, authed(path))).toEqual(
      success({ sent: 0, failed: 1 })
    );
    expect(updatesOn('requests')).toHaveLength(0);
  });

  it('every send failing → no stamp at all', async () => {
    due(['a', 'b']);
    outcomes('failed', 'failed');
    expect(await call(weekendReminders, authed(path))).toEqual(
      success({ sent: 0, failed: 2 })
    );
    expect(updatesOn('requests')).toHaveLength(0);
  });

  it('a stamp failure is logged, and the sends are still reported', async () => {
    due(['a'], 'stamp broke');
    outcomes('sent');
    expect(await call(weekendReminders, authed(path))).toEqual(
      success({ sent: 1, failed: 0 })
    );
    expect(logger.error).toHaveBeenCalledWith(
      'weekend-reminders: failed to stamp reminder_sent_at',
      expect.objectContaining({ ids: ['a'] })
    );
  });

  it('an uncaught throw escapes the handler (no envelope)', async () => {
    fake.tables.requests = () => {
      throw new Error('boom');
    };
    await expectUncaught(weekendReminders, path);
  });
});

// ---------------------------------------------------------------------------
// POST /api/cron/overdue-reminders
// ---------------------------------------------------------------------------

describe('POST /api/cron/overdue-reminders', () => {
  const path = '/api/cron/overdue-reminders';
  const due = (ids: string[], stampError: string | null = null) => {
    fake.tables.requests = (ops) =>
      has(ops, 'update')
        ? { data: null, error: stampError ? { message: stampError } : null }
        : { data: ids.map((id) => ({ id })), error: null };
  };
  const outcomes = (...list: DeliveryOutcome[]) => {
    for (const o of list) vi.mocked(notify).mockResolvedValueOnce(o);
  };
  const ZERO = { sent: 0, suppressed: 0, no_recipient: 0, failed: 0 };

  it('selects KEY_ISSUED requests past their deadline not yet reminded', async () => {
    due([]);
    const before = Date.now();
    await call(overdueReminders, authed(path));
    const [select] = queriesOn('requests');
    expect(select.client).toBe('admin');
    expect(argsOf(select.ops, 'eq')).toEqual([['status', 'KEY_ISSUED']]);
    const [[column, cutoff]] = argsOf(select.ops, 'lt') as [[string, string]];
    expect(column).toBe('return_deadline');
    expect(Date.parse(cutoff)).toBeGreaterThanOrEqual(before - 1000);
    expect(Date.parse(cutoff)).toBeLessThanOrEqual(Date.now());
    expect(argsOf(select.ops, 'is')).toEqual([
      ['overdue_reminder_sent_at', null],
    ]);
  });

  it('ref’d 500 when the query fails, without the DB text', async () => {
    fake.tables.requests = { data: null, error: { message: 'pg leaked' } };
    const res = await call(overdueReminders, authed(path));
    expectRef(res);
    expect(JSON.stringify(res.body)).not.toContain('leaked');
  });

  it('nothing due → all-zero counters, no sends, no stamp', async () => {
    due([]);
    expect(await call(overdueReminders, authed(path))).toEqual(success(ZERO));
    expect(notify).not.toHaveBeenCalled();
    expect(updatesOn('requests')).toHaveLength(0);
  });

  it('counts every outcome and stamps all but the failed', async () => {
    due(['a', 'b', 'c', 'd']);
    outcomes('sent', 'suppressed', 'no_recipient', 'failed');
    expect(await call(overdueReminders, authed(path))).toEqual(
      success({ sent: 1, suppressed: 1, no_recipient: 1, failed: 1 })
    );
    expect(vi.mocked(notify).mock.calls.map(([e]) => e)).toEqual(
      ['a', 'b', 'c', 'd'].map((requestId) => ({
        type: 'OVERDUE_REMINDER',
        requestId,
      }))
    );
    const [stamp] = updatesOn('requests');
    const [[patch]] = argsOf(stamp.ops, 'update') as [[object]];
    expect(Object.keys(patch)).toEqual(['overdue_reminder_sent_at']);
    expect(argsOf(stamp.ops, 'in')).toEqual([['id', ['a', 'b', 'c']]]);
  });

  it('every send failing → no stamp, so the next hour retries', async () => {
    due(['a', 'b']);
    outcomes('failed', 'failed');
    expect(await call(overdueReminders, authed(path))).toEqual(
      success({ ...ZERO, failed: 2 })
    );
    expect(updatesOn('requests')).toHaveLength(0);
  });

  it('a stamp failure is logged, and the counters still reported', async () => {
    due(['a'], 'stamp broke');
    outcomes('sent');
    expect(await call(overdueReminders, authed(path))).toEqual(
      success({ ...ZERO, sent: 1 })
    );
    expect(logger.error).toHaveBeenCalledWith(
      'overdue-reminders: failed to stamp overdue_reminder_sent_at',
      expect.objectContaining({ ids: ['a'] })
    );
  });

  it('an uncaught throw escapes the handler (no envelope)', async () => {
    fake.tables.requests = () => {
      throw new Error('boom');
    };
    await expectUncaught(overdueReminders, path);
  });
});

// ---------------------------------------------------------------------------
// POST /api/cron/daily-digest
// ---------------------------------------------------------------------------

describe('POST /api/cron/daily-digest', () => {
  const path = '/api/cron/daily-digest';

  const QUIET = {
    issued_count: 0,
    returned_count: 0,
    overdue_count: 0,
    weekend_submitted_count: 0,
    weekend_pending_count: 0,
    high_risk_count: 0,
    signature_mismatch_count: 0,
    incidents_count: 0,
  };
  const BUSY = { ...QUIET, issued_count: 3 };

  type P = {
    id: string;
    role: 'CSO' | 'DEAN';
    unit_id: string | null;
    full_name: string;
    institutional_email: string | null;
  };
  const cso = (id: string, email: string | null = `${id}@unilag.edu.ng`) =>
    ({
      id,
      role: 'CSO',
      unit_id: null,
      full_name: `CSO ${id}`,
      institutional_email: email,
    }) satisfies P;
  const dean = (id: string, unit: string | null = `unit-${id}`) =>
    ({
      id,
      role: 'DEAN',
      unit_id: unit,
      full_name: `Dean ${id}`,
      institutional_email: `${id}@unilag.edu.ng`,
    }) satisfies P;

  const setup = (
    profiles: P[],
    optedIn: string[] = profiles.map((p) => p.id),
    prefsError: string | null = null
  ) => {
    fake.tables.profiles = { data: profiles, error: null };
    fake.tables.notification_preferences = prefsError
      ? { data: null, error: { message: prefsError } }
      : {
          data: profiles.map((p) => ({
            profile_id: p.id,
            digest_email: optedIn.includes(p.id),
          })),
          error: null,
        };
  };
  const stats = (s: typeof QUIET | ((args: unknown) => unknown)) => {
    fake.rpc.get_digest_stats =
      typeof s === 'function'
        ? (args) => s(args) as { data: unknown; error: null }
        : { data: [s], error: null };
  };
  const sentTo = () =>
    vi.mocked(gmailTransport.send).mock.calls.map(([m]) => m.to);

  it('reads ACTIVE Dean and CSO profiles with the admin client', async () => {
    setup([]);
    await call(dailyDigest, authed(path));
    const [q] = queriesOn('profiles');
    expect(q.client).toBe('admin');
    expect(argsOf(q.ops, 'in')).toEqual([['role', ['DEAN', 'CSO']]]);
    expect(argsOf(q.ops, 'eq')).toEqual([['status', 'ACTIVE']]);
  });

  it('ref’d 500 when the profiles query fails, without the DB text', async () => {
    fake.tables.profiles = { data: null, error: { message: 'pg leaked' } };
    const res = await call(dailyDigest, authed(path));
    expectRef(res);
    expect(JSON.stringify(res.body)).not.toContain('leaked');
  });

  it('no profiles → zeros and no preferences query', async () => {
    setup([]);
    expect(await call(dailyDigest, authed(path))).toEqual(
      success({ sent: 0, skipped: 0, failed: 0 })
    );
    expect(queriesOn('notification_preferences')).toHaveLength(0);
  });

  it('a preferences query failure sends nothing and still answers 200', async () => {
    // Current behaviour, pinned (see the batch 5 report): the error is
    // ignored, so nobody counts as opted in.
    setup([cso('c1')], ['c1'], 'prefs broke');
    stats(BUSY);
    expect(await call(dailyDigest, authed(path))).toEqual(
      success({ sent: 0, skipped: 0, failed: 0 })
    );
    expect(gmailTransport.send).not.toHaveBeenCalled();
  });

  it('only digest_email = true opts in; a missing row does not', async () => {
    fake.tables.profiles = {
      data: [cso('c1'), cso('c2'), cso('c3')],
      error: null,
    };
    fake.tables.notification_preferences = {
      data: [
        { profile_id: 'c1', digest_email: true },
        { profile_id: 'c2', digest_email: false },
      ],
      error: null,
    };
    stats(BUSY);
    expect(await call(dailyDigest, authed(path))).toEqual(
      success({ sent: 1, skipped: 0, failed: 0 })
    );
    expect(sentTo()).toEqual(['c1@unilag.edu.ng']);
  });

  it('CSO stats are building-wide and fetched once for every CSO', async () => {
    setup([cso('c1'), cso('c2')]);
    stats(BUSY);
    expect(await call(dailyDigest, authed(path))).toEqual(
      success({ sent: 2, skipped: 0, failed: 0 })
    );
    expect(fake.rpcCalls).toHaveLength(1);
    const [{ args }] = fake.rpcCalls;
    expect(Object.keys(args as object)).toEqual(['p_since']);
  });

  it('a Dean gets their own unit’s stats', async () => {
    setup([dean('d1'), dean('d2')]);
    stats(BUSY);
    expect(await call(dailyDigest, authed(path))).toEqual(
      success({ sent: 2, skipped: 0, failed: 0 })
    );
    expect(
      fake.rpcCalls.map((c) => (c.args as { p_unit_id: string }).p_unit_id)
    ).toEqual(['unit-d1', 'unit-d2']);
  });

  it('accepts a single-row object as well as an array from the RPC', async () => {
    setup([dean('d1')]);
    fake.rpc.get_digest_stats = { data: BUSY, error: null };
    expect(await call(dailyDigest, authed(path))).toEqual(
      success({ sent: 1, skipped: 0, failed: 0 })
    );
  });

  it('quiet windows are skipped, not sent', async () => {
    setup([cso('c1'), dean('d1')]);
    stats(QUIET);
    expect(await call(dailyDigest, authed(path))).toEqual(
      success({ sent: 0, skipped: 2, failed: 0 })
    );
    expect(gmailTransport.send).not.toHaveBeenCalled();
  });

  it('a Dean is quiet on weekend-only activity the CSO view ignores, and vice versa', async () => {
    setup([cso('c1'), dean('d1')]);
    stats((args) => ({
      data: [
        (args as { p_unit_id?: string }).p_unit_id
          ? { ...QUIET, incidents_count: 4 }
          : { ...QUIET, weekend_pending_count: 2 },
      ],
      error: null,
    }));
    expect(await call(dailyDigest, authed(path))).toEqual(
      success({ sent: 0, skipped: 2, failed: 0 })
    );
  });

  it('no email address or no unit → skipped without an RPC call', async () => {
    setup([cso('c1', null), dean('d1', null)]);
    stats(BUSY);
    expect(await call(dailyDigest, authed(path))).toEqual(
      success({ sent: 0, skipped: 2, failed: 0 })
    );
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it('one recipient’s RPC failure is counted and the rest still send', async () => {
    setup([dean('d1'), dean('d2')]);
    stats((args) =>
      (args as { p_unit_id: string }).p_unit_id === 'unit-d1'
        ? { data: null, error: { message: 'rpc broke' } }
        : { data: [BUSY], error: null }
    );
    expect(await call(dailyDigest, authed(path))).toEqual(
      success({ sent: 1, skipped: 0, failed: 1 })
    );
    expect(sentTo()).toEqual(['d2@unilag.edu.ng']);
  });

  it('one send failure is counted and the rest still send', async () => {
    setup([cso('c1'), cso('c2')]);
    stats(BUSY);
    vi.mocked(gmailTransport.send)
      .mockRejectedValueOnce(new Error('smtp down'))
      .mockResolvedValueOnce(undefined);
    expect(await call(dailyDigest, authed(path))).toEqual(
      success({ sent: 1, skipped: 0, failed: 1 })
    );
  });

  it('an uncaught throw escapes the handler (no envelope)', async () => {
    fake.tables.profiles = () => {
      throw new Error('boom');
    };
    await expectUncaught(dailyDigest, path);
  });
});

// ---------------------------------------------------------------------------
// POST /api/cron/shift-report
// ---------------------------------------------------------------------------

describe('POST /api/cron/shift-report', () => {
  const path = '/api/cron/shift-report';
  const pending = (n: number) => {
    fake.tables.shift_reports = {
      data: Array.from({ length: n }, (_, i) => ({
        id: `r${i}`,
        shift_id: `s${i}`,
      })),
      error: null,
    };
  };

  it('drains the oldest PENDING_GENERATION placeholders, at most 5 per run', async () => {
    pending(0);
    await call(shiftReport, authed(path));
    const [q] = queriesOn('shift_reports');
    expect(q.client).toBe('admin');
    expect(argsOf(q.ops, 'eq')).toEqual([['markdown', 'PENDING_GENERATION']]);
    expect(argsOf(q.ops, 'order')).toEqual([
      ['generated_at', { ascending: true }],
    ]);
    expect(argsOf(q.ops, 'limit')).toEqual([[5]]);
  });

  it('ref’d 500 when the query fails, without the DB text', async () => {
    fake.tables.shift_reports = { data: null, error: { message: 'leaked' } };
    const res = await call(shiftReport, authed(path));
    expectRef(res);
    expect(JSON.stringify(res.body)).not.toContain('leaked');
  });

  it('nothing pending → { generated: 0, failed: 0 }', async () => {
    pending(0);
    expect(await call(shiftReport, authed(path))).toEqual(
      success({ generated: 0, failed: 0 })
    );
    expect(fillShiftReport).not.toHaveBeenCalled();
  });

  it('one row failing does not stop the rest', async () => {
    pending(3);
    vi.mocked(fillShiftReport)
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new Error('gemini down'))
      .mockResolvedValueOnce({} as never);
    expect(await call(shiftReport, authed(path))).toEqual(
      success({ generated: 2, failed: 1 })
    );
    expect(vi.mocked(fillShiftReport).mock.calls.map(([, ids]) => ids)).toEqual(
      [
        { shiftId: 's0', reportId: 'r0' },
        { shiftId: 's1', reportId: 'r1' },
        { shiftId: 's2', reportId: 'r2' },
      ]
    );
  });

  it('an uncaught throw escapes the handler (no envelope)', async () => {
    fake.tables.shift_reports = () => {
      throw new Error('boom');
    };
    await expectUncaught(shiftReport, path);
  });
});

// ---------------------------------------------------------------------------
// POST /api/cron/audit-export
// ---------------------------------------------------------------------------

describe('POST /api/cron/audit-export', () => {
  const path = '/api/cron/audit-export';
  const STATE_ID = '00000000-0000-0000-0000-000000000003';
  const WATERMARK = '2026-10-01T00:00:00.000Z';

  const row = (id: string, occurred_at: string) => ({
    id,
    event: 'KEY_ISSUED',
    actor_id: null,
    actor_role: null,
    actor_name: null,
    actor_department: null,
    target_type: 'request',
    target_id: id,
    payload: {},
    occurred_at,
  });

  const state = ({
    read = { data: { last_exported_through: WATERMARK }, error: null },
    updateError = () => null,
  }: {
    read?: { data: unknown; error: { message: string } | null };
    updateError?: (n: number) => string | null;
  } = {}) => {
    let updates = 0;
    fake.tables.audit_export_state = (ops) => {
      if (!has(ops, 'update')) return read;
      updates += 1;
      const message = updateError(updates);
      return { data: null, error: message ? { message } : null };
    };
  };
  const rows = (list: ReturnType<typeof row>[] | null, error?: string) => {
    fake.tables.audit_log = {
      data: list,
      error: error ? { message: error } : null,
    };
  };
  const watermarkUpdates = () =>
    updatesOn('audit_export_state').map(
      (q) =>
        (argsOf(q.ops, 'update')[0][0] as { last_exported_through: string })
          .last_exported_through
    );

  it('ref’d 500 when BLOB_READ_WRITE_TOKEN is unset, before any query', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
    expectRef(await call(auditExport, authed(path)));
    expect(fake.queries).toHaveLength(0);
  });

  it('ref’d 500 when the watermark read fails, without the DB text', async () => {
    state({ read: { data: null, error: { message: 'leaked' } } });
    const res = await call(auditExport, authed(path));
    expectRef(res);
    expect(JSON.stringify(res.body)).not.toContain('leaked');
    expect(queriesOn('audit_log')).toHaveLength(0);
  });

  it('ref’d 500 when the watermark row is missing', async () => {
    state({ read: { data: null, error: null } });
    expectRef(await call(auditExport, authed(path)));
  });

  it('reads the watermark singleton and only completed UTC days, capped at 20,000 rows', async () => {
    state();
    rows([]);
    await call(auditExport, authed(path));
    const [read] = queriesOn('audit_export_state');
    expect(read.client).toBe('admin');
    expect(argsOf(read.ops, 'eq')).toEqual([['id', STATE_ID]]);
    const [q] = queriesOn('audit_log');
    expect(q.client).toBe('admin');
    expect(argsOf(q.ops, 'gt')).toEqual([['occurred_at', WATERMARK]]);
    const midnight = new Date();
    midnight.setUTCHours(0, 0, 0, 0);
    expect(argsOf(q.ops, 'lt')).toEqual([
      ['occurred_at', midnight.toISOString()],
    ]);
    expect(argsOf(q.ops, 'order')).toEqual([
      ['occurred_at', { ascending: true }],
    ]);
    expect(argsOf(q.ops, 'limit')).toEqual([[20_000]]);
  });

  it('ref’d 500 when the audit_log query fails, without the DB text', async () => {
    state();
    rows(null, 'leaked');
    const res = await call(auditExport, authed(path));
    expectRef(res);
    expect(JSON.stringify(res.body)).not.toContain('leaked');
    expect(put).not.toHaveBeenCalled();
  });

  it('no rows → { exported_days: 0, exported_rows: 0 }, nothing uploaded', async () => {
    state();
    rows([]);
    expect(await call(auditExport, authed(path))).toEqual(
      success({ exported_days: 0, exported_rows: 0 })
    );
    expect(put).not.toHaveBeenCalled();
    expect(updatesOn('audit_export_state')).toHaveLength(0);
  });

  it('writes one private NDJSON blob per day and advances the watermark day by day', async () => {
    state();
    const day1 = [
      row('a', '2026-10-02T08:00:00.000Z'),
      row('b', '2026-10-02T23:59:00.000Z'),
    ];
    const day2 = [row('c', '2026-10-03T01:00:00.000Z')];
    rows([...day1, ...day2]);
    expect(await call(auditExport, authed(path))).toEqual(
      success({ exported_days: 2, exported_rows: 3 })
    );
    const options = {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/x-ndjson',
    };
    expect(vi.mocked(put).mock.calls).toEqual([
      [
        'audit-log/2026-10-02.ndjson',
        day1.map((r) => JSON.stringify(r)).join('\n') + '\n',
        options,
      ],
      ['audit-log/2026-10-03.ndjson', JSON.stringify(day2[0]) + '\n', options],
    ]);
    expect(watermarkUpdates()).toEqual([
      '2026-10-03T00:00:00.000Z',
      '2026-10-04T00:00:00.000Z',
    ]);
    for (const q of updatesOn('audit_export_state')) {
      expect(argsOf(q.ops, 'eq')).toEqual([['id', STATE_ID]]);
    }
  });

  it('a failed upload stops the run without advancing past that day', async () => {
    state();
    rows([
      row('a', '2026-10-02T08:00:00.000Z'),
      row('b', '2026-10-03T08:00:00.000Z'),
      row('c', '2026-10-04T08:00:00.000Z'),
    ]);
    vi.mocked(put)
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new Error('blob down'));
    expect(await call(auditExport, authed(path))).toEqual(
      success({ exported_days: 1, exported_rows: 1 })
    );
    expect(put).toHaveBeenCalledTimes(2);
    expect(watermarkUpdates()).toEqual(['2026-10-03T00:00:00.000Z']);
  });

  it('a failed watermark update stops the run and does not count that day', async () => {
    state({ updateError: (n) => (n === 1 ? 'pg broke' : null) });
    rows([
      row('a', '2026-10-02T08:00:00.000Z'),
      row('b', '2026-10-03T08:00:00.000Z'),
    ]);
    expect(await call(auditExport, authed(path))).toEqual(
      success({ exported_days: 0, exported_rows: 0 })
    );
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('an uncaught throw escapes the handler (no envelope)', async () => {
    fake.tables.audit_export_state = () => {
      throw new Error('boom');
    };
    await expectUncaught(auditExport, path);
  });
});
