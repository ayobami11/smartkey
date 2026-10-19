// The Request lifecycle module (src/lib/requests/lifecycle.ts): one function
// per step, called by both the registered and the guest route. These tests
// drive each step through both targets against a fake RPC client and check
// that the guest/registered difference stops at "which RPC, which argument":
// the same raised kind becomes the same status and copy either way.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { logger } from '@/lib/logger';
import { notifyAfterResponse } from '@/lib/notifications/notify';
import {
  expireCollectionCode,
  generateCollectionCode,
  generateReturnCode,
  type LifecycleTarget,
} from '@/lib/requests/lifecycle';
import type { RpcClient } from '@/lib/rpc/call-rpc';

vi.mock('@/lib/notifications/notify', () => ({
  notifyAfterResponse: vi.fn(),
}));

const REQUEST_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const TOKEN = '44444444-4444-4444-8444-444444444444';
const REF_PATTERN = /^Internal error\. Ref: [0-9a-f-]{36}$/;

type Answer = { data: unknown; error: { message: string } | null };

// A client whose rpc() records the call and answers `answer`.
const fakeClient = (answer: Answer) => {
  const calls: { name: string; args: unknown }[] = [];
  const client = {
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return answer;
    },
  } as unknown as RpcClient;
  return { client, calls };
};

const raised = (message: string): Answer => ({
  data: null,
  error: { message },
});
const row = (value: Record<string, unknown>): Answer => ({
  data: [value],
  error: null,
});

const registered: LifecycleTarget = {
  kind: 'registered',
  requestId: REQUEST_ID,
  requesterId: USER_ID,
};
const guest: LifecycleTarget = { kind: 'guest', accessToken: TOKEN };

type Step = {
  name: string;
  run: typeof generateCollectionCode;
  rpc: { registered: string; guest: string };
  okRow: Record<string, unknown>;
  // Every kind this step's RPCs can raise, with the copy both routes send.
  errors: Array<[raised: string, status: number, message: string]>;
};

const NOT_AUTHENTICATED: [string, number, string] = [
  'NOT_AUTHENTICATED',
  401,
  'Not authenticated',
];
const NOT_FOUND: [string, number, string] = [
  'NOT_FOUND: request does not exist',
  404,
  'Request not found',
];
const FORBIDDEN: [string, number, string] = [
  'FORBIDDEN: not your request',
  403,
  'This is not your request',
];

const STEPS: Step[] = [
  {
    name: 'generateCollectionCode',
    run: generateCollectionCode,
    rpc: {
      registered: 'generate_weekend_code',
      guest: 'generate_guest_weekend_code',
    },
    okRow: {
      request_id: REQUEST_ID,
      code: '123456',
      code_expires_at: '2026-10-19T09:10:00Z',
    },
    errors: [
      NOT_AUTHENTICATED,
      NOT_FOUND,
      FORBIDDEN,
      [
        'CONFLICT: request is not in APPROVED state (current: PENDING_HOD)',
        409,
        'This request is not approved for collection.',
      ],
      [
        'TOO_EARLY: a collection code can only be generated on the requested date',
        422,
        'A collection code can only be generated on the requested date.',
      ],
      [
        'NO_KEYS_AVAILABLE: every key on this bunch is currently out or reserved (1 of 1)',
        409,
        'No key is available for this room right now. Every key is out or reserved — try again once one is returned.',
      ],
    ],
  },
  {
    name: 'generateReturnCode',
    run: generateReturnCode as typeof generateCollectionCode,
    rpc: { registered: 'request_return', guest: 'request_return_guest' },
    okRow: {
      request_id: REQUEST_ID,
      return_code: '654321',
      return_code_expires_at: '2026-10-19T09:15:00Z',
    },
    errors: [
      NOT_AUTHENTICATED,
      NOT_FOUND,
      FORBIDDEN,
      [
        'NOT_ISSUED: request is not in KEY_ISSUED state (current: CODE_ISSUED)',
        409,
        'This key is not currently issued to you',
      ],
    ],
  },
  {
    name: 'expireCollectionCode',
    run: expireCollectionCode as typeof generateCollectionCode,
    rpc: { registered: 'expire_request', guest: 'expire_guest_request' },
    okRow: { request_id: REQUEST_ID, status: 'APPROVED' },
    errors: [
      NOT_AUTHENTICATED,
      NOT_FOUND,
      FORBIDDEN,
      [
        'NOT_EXPIRED: the code has not expired yet',
        409,
        'This code has not expired yet.',
      ],
    ],
  },
];

beforeEach(() => {
  vi.mocked(notifyAfterResponse).mockClear();
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);
});

describe.each(STEPS)('$name', (step) => {
  it('calls the registered RPC with the request and the session user', async () => {
    const { client, calls } = fakeClient(row(step.okRow));
    await step.run(client, registered);
    expect(calls).toEqual([
      {
        name: step.rpc.registered,
        args: { p_request_id: REQUEST_ID, p_requester_id: USER_ID },
      },
    ]);
  });

  it('calls the guest RPC with the access token only', async () => {
    const { client, calls } = fakeClient(row(step.okRow));
    await step.run(client, guest);
    expect(calls).toEqual([
      { name: step.rpc.guest, args: { p_access_token: TOKEN } },
    ]);
  });

  it.each([
    ['registered', registered],
    ['guest', guest],
  ] as const)('returns the RPC row for a %s target', async (_k, target) => {
    const { client } = fakeClient(row(step.okRow));
    expect(await step.run(client, target)).toEqual({
      ok: true,
      data: step.okRow,
    });
  });

  it.each(step.errors)(
    '%s → %i with the same copy for both targets',
    async (message, status, copy) => {
      const outcomes = await Promise.all(
        [registered, guest].map((target) =>
          step.run(fakeClient(raised(message)).client, target)
        )
      );
      for (const outcome of outcomes) {
        expect(outcome).toEqual({ ok: false, error: { status, message: copy } });
      }
    }
  );

  it.each([
    ['registered', registered],
    ['guest', guest],
  ] as const)(
    'answers an unrecognised failure with a ref for a %s target',
    async (_k, target) => {
      const { client } = fakeClient(raised('connection reset by peer'));
      const outcome = await step.run(client, target);
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.error.status).toBe(500);
      expect(outcome.error.message).toMatch(REF_PATTERN);
      expect(outcome.error.message).not.toContain('connection');
    }
  );

  it('answers an empty result with a ref', async () => {
    const { client } = fakeClient({ data: [], error: null });
    const outcome = await step.run(client, guest);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.message).toMatch(REF_PATTERN);
  });
});

describe('the code email', () => {
  it.each([
    ['registered', registered],
    ['guest', guest],
  ] as const)(
    'generateCollectionCode emails a %s holder after a mint, and only then',
    async (_k, target) => {
      await generateCollectionCode(
        fakeClient(raised('TOO_EARLY: not yet')).client,
        target
      );
      expect(notifyAfterResponse).not.toHaveBeenCalled();

      await generateCollectionCode(
        fakeClient(row(STEPS[0].okRow)).client,
        target
      );
      expect(vi.mocked(notifyAfterResponse).mock.calls).toEqual([
        [{ type: 'CODE_ISSUED', requestId: REQUEST_ID }],
      ]);
    }
  );

  it('the other steps never email', async () => {
    await generateReturnCode(fakeClient(row(STEPS[1].okRow)).client, guest);
    await expireCollectionCode(fakeClient(row(STEPS[2].okRow)).client, guest);
    expect(notifyAfterResponse).not.toHaveBeenCalled();
  });
});
