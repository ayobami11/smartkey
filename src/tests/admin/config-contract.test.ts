// @vitest-environment node
// Contract for the CSO configuration and inventory routes under admin/:
// risk-rules, operational-config, units and keys. Status and message for
// every auth outcome, bad body, query failure and RPC error kind each route
// maps, plus success shapes. Written against the routes before they moved
// onto route(); kept as the regression net after.
import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as createKey } from '@/app/api/admin/keys/route';
import {
  GET as getOperational,
  PATCH as patchOperational,
} from '@/app/api/admin/operational-config/route';
import {
  GET as getRiskRules,
  PATCH as patchRiskRules,
} from '@/app/api/admin/risk-rules/route';
import { GET as listUnits } from '@/app/api/admin/units/route';
import { logger } from '@/lib/logger';

import {
  asRole,
  call,
  describeAuth,
  expectRef,
  failure,
  fake,
  get,
  post,
  resetFake,
  rpcError,
  send,
  success,
} from '../http/contract-harness';

vi.mock('@/lib/supabase/server', async () => {
  const h = await import('../http/contract-harness');
  return { createServerClient: async () => h.makeClient('server') };
});
vi.mock('@/lib/supabase/admin', async () => {
  const h = await import('../http/contract-harness');
  return { createAdminClient: () => h.makeClient('admin') };
});

const UNIT_ID = '77777777-7777-4777-8777-777777777777';
const KEY_ID = '33333333-3333-4333-8333-333333333333';

// The routes before route(): a session with no profile row was refused with
// 403 alongside the wrong roles, rather than 401.
const describeAuthNoProfile403 = (
  label: string,
  handler: unknown,
  makeRequest: () => NextRequest
) => {
  describe(`${label} auth`, () => {
    it('401 Unauthorized with no session', async () => {
      fake.user = null;
      expect(await call(handler, makeRequest())).toEqual(
        failure(401, 'Unauthorized')
      );
    });

    it('403 Forbidden when the user has no profile', async () => {
      fake.profile = null;
      expect(await call(handler, makeRequest())).toEqual(
        failure(403, 'Forbidden')
      );
    });

    it.each(['DEAN', 'VERIFIER', 'REQUESTER'] as const)(
      '403 Forbidden for %s',
      async (role) => {
        asRole(role);
        expect(await call(handler, makeRequest())).toEqual(
          failure(403, 'Forbidden')
        );
      }
    );
  });
};

beforeEach(() => {
  resetFake();
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
});

// ---------------------------------------------------------------------------
// /api/admin/risk-rules
// ---------------------------------------------------------------------------

const RULES = [
  { rule_key: 'outside_operational_hours', weight: 3, enabled: true },
  { rule_key: 'outstanding_key_not_returned', weight: 5, enabled: true },
  { rule_key: 'weekend_without_memo', weight: 4, enabled: false },
  { rule_key: 'excess_request_frequency', weight: 2, enabled: true },
  { rule_key: 'collector_not_whitelisted', weight: 5, enabled: true },
];
const TIER = { medium_min: 4, high_min: 7 };

describe('GET /api/admin/risk-rules', () => {
  const path = '/api/admin/risk-rules';

  // BUG: a signed-in user with no profile row gets 403, not 401.
  describeAuthNoProfile403('admin/risk-rules GET', getRiskRules, () =>
    get(path)
  );

  beforeEach(() => {
    asRole('CSO');
    fake.tables.risk_rule_config = { data: RULES, error: null };
    fake.tables.risk_tier_config = { data: TIER, error: null };
  });

  it.each([
    ['the rules read fails', 'risk_rule_config'],
    ['the tier read fails', 'risk_tier_config'],
  ])('500 with a ref when %s', async (_label, table) => {
    fake.tables[table] = { data: null, error: { message: 'boom' } };
    expectRef(await call(getRiskRules, get(path)));
  });

  it('500 with a ref when the tier row is missing', async () => {
    fake.tables.risk_tier_config = { data: null, error: null };
    expectRef(await call(getRiskRules, get(path)));
  });

  it('returns the rules and tier', async () => {
    expect(await call(getRiskRules, get(path))).toEqual(
      success({ rules: RULES, tier: TIER })
    );
  });
});

describe('PATCH /api/admin/risk-rules', () => {
  const path = '/api/admin/risk-rules';
  const body = { rules: RULES, tier: TIER };

  // BUG: a signed-in user with no profile row gets 403, not 401.
  describeAuthNoProfile403('admin/risk-rules PATCH', patchRiskRules, () =>
    send('PATCH', path, body)
  );

  beforeEach(() => asRole('CSO'));

  it.each([
    ['not JSON', 'not json'],
    ['four rules', { ...body, rules: RULES.slice(0, 4) }],
    ['a duplicate rule', { ...body, rules: [...RULES.slice(0, 4), RULES[0]] }],
    [
      'a weight of 11',
      { ...body, rules: [{ ...RULES[0], weight: 11 }, ...RULES.slice(1)] },
    ],
    [
      'high_min not above medium_min',
      { ...body, tier: { medium_min: 5, high_min: 5 } },
    ],
  ])('422 for %s', async (_label, bad) => {
    expect(await call(patchRiskRules, send('PATCH', path, bad))).toEqual(
      failure(422, 'Invalid request body')
    );
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it.each([
    ['NOT_AUTHENTICATED', 401, 'Unauthorized'],
    [
      'FORBIDDEN: only the CSO can update risk configuration',
      403,
      'Only the CSO can update risk configuration',
    ],
    [
      'INVALID_TIER_BOUNDS: high_min must exceed medium_min',
      422,
      'high_min must exceed medium_min',
    ],
    ['INVALID_RULES: unknown rule_key nope', 422, 'Invalid rule configuration'],
  ])('maps %s → %i', async (raised, status, message) => {
    fake.rpc.update_risk_config = rpcError(raised);
    expect(await call(patchRiskRules, send('PATCH', path, body))).toEqual(
      failure(status, message)
    );
  });

  it('500 with a ref for an unrecognised RPC failure', async () => {
    fake.rpc.update_risk_config = rpcError('connection reset');
    expectRef(await call(patchRiskRules, send('PATCH', path, body)));
  });

  it('echoes the saved config; a void RPC result is success', async () => {
    expect(await call(patchRiskRules, send('PATCH', path, body))).toEqual(
      success({ rules: RULES, tier: TIER })
    );
    expect(fake.rpcCalls).toEqual([
      {
        name: 'update_risk_config',
        args: { p_rules: RULES, p_medium_min: 4, p_high_min: 7 },
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// /api/admin/operational-config
// ---------------------------------------------------------------------------

const ZONES = [
  {
    zone: 'NEW_SENATE',
    weekday_open: '06:00',
    weekday_close: '22:00',
    weekend_closed: true,
    weekend_open: null,
    weekend_close: null,
  },
  {
    zone: 'OLD_SENATE',
    weekday_open: '07:00',
    weekday_close: '20:00',
    weekend_closed: false,
    weekend_open: '08:00',
    weekend_close: '18:00',
  },
];

describe('GET /api/admin/operational-config', () => {
  const path = '/api/admin/operational-config';

  // BUG: a signed-in user with no profile row gets 403, not 401.
  describeAuthNoProfile403('admin/operational-config GET', getOperational, () =>
    get(path)
  );

  beforeEach(() => {
    asRole('CSO');
    fake.tables.zone_hours = {
      data: [
        {
          ...ZONES[0],
          weekday_open: '06:00:00',
          weekday_close: '22:00:00',
        },
        {
          ...ZONES[1],
          weekday_open: '07:00:00',
          weekday_close: '20:00:00',
          weekend_open: '08:00:00',
          weekend_close: '18:00:00',
        },
      ],
      error: null,
    };
    fake.tables.operational_config = {
      data: { return_deadline_time: '17:00:00', code_expiry_minutes: 10 },
      error: null,
    };
  });

  it.each([
    ['the zone read fails', 'zone_hours'],
    ['the config read fails', 'operational_config'],
  ])('500 with a ref when %s', async (_label, table) => {
    fake.tables[table] = { data: null, error: { message: 'boom' } };
    expectRef(await call(getOperational, get(path)));
  });

  it('500 with a ref when the config row is missing', async () => {
    fake.tables.operational_config = { data: null, error: null };
    expectRef(await call(getOperational, get(path)));
  });

  it('returns zones and config with times as HH:MM', async () => {
    expect(await call(getOperational, get(path))).toEqual(
      success({
        zones: ZONES,
        return_deadline_time: '17:00',
        code_expiry_minutes: 10,
      })
    );
  });
});

describe('PATCH /api/admin/operational-config', () => {
  const path = '/api/admin/operational-config';
  const body = {
    zones: ZONES,
    return_deadline_time: '17:00',
    code_expiry_minutes: 10,
  };

  // BUG: a signed-in user with no profile row gets 403, not 401.
  describeAuthNoProfile403(
    'admin/operational-config PATCH',
    patchOperational,
    () => send('PATCH', path, body)
  );

  beforeEach(() => asRole('CSO'));

  it.each([
    ['not JSON', 'not json'],
    ['one zone', { ...body, zones: [ZONES[0]] }],
    ['the same zone twice', { ...body, zones: [ZONES[0], ZONES[0]] }],
    ['a bad time', { ...body, return_deadline_time: '25:00' }],
    ['expiry of 4 minutes', { ...body, code_expiry_minutes: 4 }],
    [
      'weekend open with no hours',
      {
        ...body,
        zones: [{ ...ZONES[0], weekend_closed: false }, ZONES[1]],
      },
    ],
  ])('422 for %s', async (_label, bad) => {
    expect(await call(patchOperational, send('PATCH', path, bad))).toEqual(
      failure(422, 'Invalid request body')
    );
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it.each([
    ['NOT_AUTHENTICATED', 401, 'Unauthorized'],
    [
      'FORBIDDEN: only the CSO can update operational configuration',
      403,
      'Only the CSO can update operational configuration',
    ],
    [
      'INVALID_ZONE_HOURS: weekday_open must be before weekday_close for NEW_SENATE',
      422,
      'Invalid zone hours',
    ],
    [
      'INVALID_CONFIG: code_expiry_minutes must be between 5 and 60',
      422,
      'Invalid operational configuration',
    ],
  ])('maps %s → %i', async (raised, status, message) => {
    fake.rpc.update_operational_config = rpcError(raised);
    expect(await call(patchOperational, send('PATCH', path, body))).toEqual(
      failure(status, message)
    );
  });

  it('500 with a ref for an unrecognised RPC failure', async () => {
    fake.rpc.update_operational_config = rpcError('connection reset');
    expectRef(await call(patchOperational, send('PATCH', path, body)));
  });

  it('echoes the saved config; a void RPC result is success', async () => {
    expect(await call(patchOperational, send('PATCH', path, body))).toEqual(
      success(body)
    );
    expect(fake.rpcCalls).toEqual([
      {
        name: 'update_operational_config',
        args: {
          p_zone_hours: ZONES,
          p_return_deadline_time: '17:00',
          p_code_expiry_minutes: 10,
        },
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/units
// ---------------------------------------------------------------------------

describe('GET /api/admin/units', () => {
  const path = '/api/admin/units';

  describeAuth('admin/units', listUnits, () => get(path), ['CSO']);

  beforeEach(() => {
    asRole('CSO');
    fake.tables.units = {
      data: [
        {
          id: 'u1',
          name: 'Engineering',
          faculty: 'Engineering',
          hod_id: 'dean-1',
          authoriser: 'DEAN',
          hod: { status: 'ACTIVE' },
        },
        {
          id: 'u2',
          name: 'Administration',
          faculty: 'Administration',
          hod_id: null,
          authoriser: 'CSO',
          hod: null,
        },
        {
          id: 'u3',
          name: 'Science',
          faculty: 'Science',
          hod_id: 'dean-3',
          authoriser: 'DEAN',
          hod: { status: 'PENDING_ACTIVATION' },
        },
      ],
      error: null,
    };
    fake.rpc.get_key_occupancy = {
      data: [
        { unit_id: 'u1', available: 0 },
        { unit_id: 'u1', available: 2 },
        { unit_id: 'u2', available: 0 },
      ],
      error: null,
    };
  });

  it('500 Failed to fetch units when the units query fails', async () => {
    fake.tables.units = { data: null, error: { message: 'boom' } };
    expect(await call(listUnits, get(path))).toEqual(
      failure(500, 'Failed to fetch units')
    );
  });

  it('500 with a ref when get_key_occupancy fails', async () => {
    fake.rpc.get_key_occupancy = rpcError('FORBIDDEN: nope');
    expectRef(await call(listUnits, get(path)));
  });

  it('derives has_hod and has_slot_today', async () => {
    expect(await call(listUnits, get(path))).toEqual(
      success({
        units: [
          {
            id: 'u1',
            name: 'Engineering',
            faculty: 'Engineering',
            authoriser: 'DEAN',
            hod_id: 'dean-1',
            has_hod: true,
            has_slot_today: true,
          },
          {
            id: 'u2',
            name: 'Administration',
            faculty: 'Administration',
            authoriser: 'CSO',
            hod_id: null,
            has_hod: false,
            has_slot_today: false,
          },
          {
            id: 'u3',
            name: 'Science',
            faculty: 'Science',
            authoriser: 'DEAN',
            hod_id: 'dean-3',
            has_hod: false,
            has_slot_today: false,
          },
        ],
      })
    );
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/keys
// ---------------------------------------------------------------------------

describe('POST /api/admin/keys', () => {
  const path = '/api/admin/keys';
  const body = {
    code: 'NS-304',
    zone: 'NEW_SENATE',
    room_name: 'Senate Hall A',
    unit_id: UNIT_ID,
  };

  // BUG: a signed-in user with no profile row gets 403, not 401.
  describeAuthNoProfile403('admin/keys', createKey, () => post(path, body));

  beforeEach(() => {
    asRole('CSO');
    fake.tables.keys = { data: { id: KEY_ID }, error: null };
  });

  it.each([
    ['not JSON', 'not json'],
    ['a lower-case code', { ...body, code: 'ns-304' }],
    ['an unknown zone', { ...body, zone: 'MOON' }],
    ['21 copies', { ...body, key_count: 21 }],
    ['a non-uuid unit', { ...body, unit_id: 'x' }],
  ])('422 for %s', async (_label, bad) => {
    expect(await call(createKey, post(path, bad))).toEqual(
      failure(422, 'Invalid request body')
    );
  });

  it('409 when the key code is taken', async () => {
    fake.tables.keys = {
      data: null,
      error: { message: 'duplicate key', code: '23505' },
    };
    expect(await call(createKey, post(path, body))).toEqual(
      failure(409, 'Key code "NS-304" is already in use.')
    );
  });

  it('500 with a ref for any other insert failure', async () => {
    fake.tables.keys = { data: null, error: { message: 'boom' } };
    expectRef(await call(createKey, post(path, body)));
  });

  it('201 with the new key id, key_count defaulting to 1', async () => {
    expect(await call(createKey, post(path, body))).toEqual(
      success({ key_id: KEY_ID }, 201)
    );
    const insert = fake.queries.find((q) => q.table === 'keys');
    expect(insert?.client).toBe('server');
    expect(insert?.ops[0]).toEqual([
      'insert',
      [{ ...body, key_count: 1, status: 'AVAILABLE' }],
    ]);
  });
});
