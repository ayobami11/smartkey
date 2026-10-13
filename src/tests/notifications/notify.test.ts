import { describe, expect, it, vi } from 'vitest';

import { createOutbox, type Transport } from '@/lib/email/transport';
import type { NotificationContext } from '@/lib/notifications/context';
import { notify, type NotifyPorts } from '@/lib/notifications/notify';

const context: NotificationContext = {
  request: {
    id: 'req-1',
    type: 'WEEKEND',
    requestedFor: '2026-10-17',
    returnDeadline: null,
    code: null,
    codeExpiresAt: null,
    accessToken: null,
    decisionToken: null,
    requestedRoom: null,
  },
  requester: {
    kind: 'registered',
    id: 'r',
    name: 'Requester',
    email: 'r@unilag.test',
    prefs: null,
  },
  key: { code: 'NS-304', roomName: 'Senate Hall A' },
  unit: { name: 'Administration', authoriser: 'CSO', dean: null },
  csos: [
    { id: 'a', name: 'CSO A', email: 'a@unilag.test', prefs: null },
    { id: 'b', name: 'CSO B', email: 'b@unilag.test', prefs: null },
  ],
};

const ports = (overrides: Partial<NotifyPorts> = {}): NotifyPorts => ({
  load: async () => context,
  transport: createOutbox().transport,
  siteUrl: 'https://smartkey.test',
  ...overrides,
});

const submitted = { type: 'WEEKEND_SUBMITTED', requestId: 'req-1' } as const;

describe('notify', () => {
  it('sends every message the rules produce', async () => {
    const outbox = createOutbox();
    await expect(
      notify(submitted, ports({ transport: outbox.transport }))
    ).resolves.toBe('sent');
    expect(outbox.sent.map((m) => m.to)).toEqual([
      'a@unilag.test',
      'b@unilag.test',
    ]);
  });

  it('reports a rule skip without sending', async () => {
    const outbox = createOutbox();
    const outcome = await notify(
      {
        type: 'WEEKEND_DECIDED',
        requestId: 'req-1',
        decision: 'DECLINED',
      },
      ports({
        transport: outbox.transport,
        load: async () => ({
          ...context,
          requester: { kind: 'guest', name: 'G', email: 'g@x.test' },
        }),
      })
    );
    expect(outcome).toBe('suppressed');
    expect(outbox.sent).toEqual([]);
  });

  it('reports no_recipient for an unknown request', async () => {
    await expect(
      notify(submitted, ports({ load: async () => null }))
    ).resolves.toBe('no_recipient');
  });

  it('is sent if at least one recipient got it', async () => {
    const send = vi
      .fn<Transport['send']>()
      .mockRejectedValueOnce(new Error('SMTP down'))
      .mockResolvedValueOnce(undefined);
    await expect(
      notify(submitted, ports({ transport: { send } }))
    ).resolves.toBe('sent');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('returns failed rather than throwing when every send fails', async () => {
    const send = vi
      .fn<Transport['send']>()
      .mockRejectedValue(new Error('down'));
    await expect(
      notify(submitted, ports({ transport: { send } }))
    ).resolves.toBe('failed');
  });

  it('returns failed rather than throwing when loading fails', async () => {
    await expect(
      notify(
        submitted,
        ports({
          load: async () => {
            throw new Error('db down');
          },
        })
      )
    ).resolves.toBe('failed');
  });
});
