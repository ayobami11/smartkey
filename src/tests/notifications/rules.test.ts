import { describe, expect, it } from 'vitest';

import type { NotificationContext, Person } from '@/lib/notifications/context';
import { messagesFor } from '@/lib/notifications/rules';

const SITE = 'https://smartkey.test';
const REQUEST_ID = 'req-1';

const person = (id: string, overrides: Partial<Person> = {}): Person => ({
  id,
  name: `Person ${id}`,
  email: `${id}@unilag.test`,
  prefs: null,
  ...overrides,
});

const dean = person('dean');
const csoA = person('cso-a');
const csoB = person('cso-b');

const ctx = (
  overrides: Partial<NotificationContext> = {},
  request: Partial<NotificationContext['request']> = {}
): NotificationContext => ({
  request: {
    id: REQUEST_ID,
    type: 'WEEKEND',
    requestedFor: '2026-10-17',
    returnDeadline: '2026-10-17T16:00:00Z',
    code: null,
    codeExpiresAt: null,
    accessToken: 'access-token',
    decisionToken: 'decision-token',
    requestedRoom: null,
    ...request,
  },
  requester: { kind: 'registered', ...person('requester') },
  key: { code: 'NS-304', roomName: 'Senate Hall A' },
  unit: { name: 'Faculty of Law', authoriser: 'DEAN', dean },
  csos: [csoA, csoB],
  ...overrides,
});

const guest = {
  kind: 'guest' as const,
  name: 'Jane Guest',
  email: 'jane@guest.test',
};

describe('WEEKEND_SUBMITTED', () => {
  const event = { type: 'WEEKEND_SUBMITTED', requestId: REQUEST_ID } as const;

  it('emails the Dean with the one-click link for a Dean unit', () => {
    const plan = messagesFor(event, ctx(), SITE);
    expect(plan.messages.map((m) => m.to)).toEqual(['dean@unilag.test']);
    expect(plan.messages[0].html.toString()).toContain(
      `${SITE}/dean-decision/decision-token`
    );
  });

  it('omits the one-click link when the request has no token', () => {
    const plan = messagesFor(event, ctx({}, { decisionToken: null }), SITE);
    expect(plan.messages[0].html.toString()).not.toContain('/dean-decision/');
  });

  it('respects the Dean turning the email off', () => {
    const plan = messagesFor(
      event,
      ctx({
        unit: {
          name: 'Faculty of Law',
          authoriser: 'DEAN',
          dean: person('dean', { prefs: { weekend_submitted_email: false } }),
        },
      }),
      SITE
    );
    expect(plan).toEqual({ messages: [], skipped: 'suppressed' });
  });

  it('reports no_recipient when the unit has no Dean', () => {
    const plan = messagesFor(
      event,
      ctx({ unit: { name: 'Faculty of Law', authoriser: 'DEAN', dean: null } }),
      SITE
    );
    expect(plan).toEqual({ messages: [], skipped: 'no_recipient' });
  });

  it('emails every CSO for an Administration unit, without a one-click link', () => {
    const plan = messagesFor(
      event,
      ctx({ unit: { name: 'Administration', authoriser: 'CSO', dean: null } }),
      SITE
    );
    expect(plan.messages.map((m) => m.to)).toEqual([
      'cso-a@unilag.test',
      'cso-b@unilag.test',
    ]);
    expect(plan.messages[0].html.toString()).toContain(
      `${SITE}/cso/weekend-requests`
    );
    expect(plan.messages[0].html.toString()).not.toContain('/dean-decision/');
  });

  it('honours a CSO turning the email off (it used to be ignored)', () => {
    const plan = messagesFor(
      event,
      ctx({
        unit: { name: 'Administration', authoriser: 'CSO', dean: null },
        csos: [
          person('cso-a', { prefs: { weekend_submitted_email: false } }),
          csoB,
        ],
      }),
      SITE
    );
    expect(plan.messages.map((m) => m.to)).toEqual(['cso-b@unilag.test']);
  });

  it('formats the requested date for reading, not as an ISO date', () => {
    const html = messagesFor(event, ctx(), SITE).messages[0].html.toString();
    expect(html).not.toContain('2026-10-17');
    expect(html).toContain('October');
  });

  it("uses a guest's own room text before a key is assigned", () => {
    const html = messagesFor(
      event,
      ctx({ requester: guest, key: null }, { requestedRoom: 'Moot court' }),
      SITE
    ).messages[0].html.toString();
    expect(html).toContain('Moot court');
    expect(html).toContain('External');
  });
});

describe('WEEKEND_DECIDED', () => {
  const approved = {
    type: 'WEEKEND_DECIDED',
    requestId: REQUEST_ID,
    decision: 'APPROVED',
  } as const;
  const declined = {
    type: 'WEEKEND_DECIDED',
    requestId: REQUEST_ID,
    decision: 'DECLINED',
    note: 'No memo',
  } as const;

  it('emails a registered requester the approval with their code page', () => {
    const plan = messagesFor(approved, ctx(), SITE);
    expect(plan.messages[0].to).toBe('requester@unilag.test');
    expect(plan.messages[0].html.toString()).toContain(
      `${SITE}/requester/request/${REQUEST_ID}/code`
    );
  });

  it('includes the authoriser note on a decline', () => {
    const plan = messagesFor(declined, ctx(), SITE);
    expect(plan.messages[0].html.toString()).toContain('No memo');
  });

  it('respects weekend_decided_email', () => {
    const plan = messagesFor(
      approved,
      ctx({
        requester: {
          kind: 'registered',
          ...person('requester', { prefs: { weekend_decided_email: false } }),
        },
      }),
      SITE
    );
    expect(plan.skipped).toBe('suppressed');
  });

  it('emails a guest approval with their status-page link', () => {
    const plan = messagesFor(approved, ctx({ requester: guest }), SITE);
    expect(plan.messages[0].to).toBe('jane@guest.test');
    expect(plan.messages[0].html.toString()).toContain(
      `${SITE}/weekend-access/access-token`
    );
  });

  it('never emails a guest a decline', () => {
    expect(messagesFor(declined, ctx({ requester: guest }), SITE)).toEqual({
      messages: [],
      skipped: 'suppressed',
    });
  });
});

describe('SIGNATURE_MISMATCH', () => {
  const event = {
    type: 'SIGNATURE_MISMATCH',
    requestId: REQUEST_ID,
    mismatches: { stamp: 80 },
    thresholdPct: 55,
  } as const;

  it('emails every CSO who has not turned it off', () => {
    const plan = messagesFor(
      event,
      ctx({
        csos: [
          csoA,
          person('cso-b', { prefs: { signature_mismatch_email: false } }),
        ],
      }),
      SITE
    );
    expect(plan.messages.map((m) => m.to)).toEqual(['cso-a@unilag.test']);
  });

  it('reports no_recipient when there is no active CSO', () => {
    expect(messagesFor(event, ctx({ csos: [] }), SITE).skipped).toBe(
      'no_recipient'
    );
  });
});

describe('CODE_ISSUED', () => {
  const event = { type: 'CODE_ISSUED', requestId: REQUEST_ID } as const;

  it('emails the code to the requester', () => {
    const plan = messagesFor(
      event,
      ctx({}, { code: '123456', codeExpiresAt: '2026-10-13T10:00:00Z' }),
      SITE
    );
    expect(plan.messages[0].to).toBe('requester@unilag.test');
    expect(plan.messages[0].html.toString()).toContain('123456');
  });

  it('cannot be turned off by a preference', () => {
    const plan = messagesFor(
      event,
      ctx(
        {
          requester: {
            kind: 'registered',
            ...person('requester', {
              prefs: {
                weekend_decided_email: false,
                overdue_email: false,
              },
            }),
          },
        },
        { code: '123456', codeExpiresAt: '2026-10-13T10:00:00Z' }
      ),
      SITE
    );
    expect(plan.messages).toHaveLength(1);
  });

  it('sends nothing when the request has no live code', () => {
    expect(messagesFor(event, ctx(), SITE).skipped).toBe('no_recipient');
  });
});

describe('OVERDUE_REMINDER', () => {
  const event = { type: 'OVERDUE_REMINDER', requestId: REQUEST_ID } as const;

  it('respects overdue_email for a registered requester', () => {
    const plan = messagesFor(
      event,
      ctx({
        requester: {
          kind: 'registered',
          ...person('requester', { prefs: { overdue_email: false } }),
        },
      }),
      SITE
    );
    expect(plan.skipped).toBe('suppressed');
  });

  it('always reminds a guest', () => {
    expect(
      messagesFor(event, ctx({ requester: guest }), SITE).messages
    ).toHaveLength(1);
  });

  it('reports no_recipient when the requester has no address', () => {
    const plan = messagesFor(
      event,
      ctx({
        requester: {
          kind: 'registered',
          ...person('requester', { email: null }),
        },
      }),
      SITE
    );
    expect(plan.skipped).toBe('no_recipient');
  });
});

describe('WEEKEND_REMINDER and GUEST_SUBMISSION_RECEIVED', () => {
  it('links a registered requester to their dashboard', () => {
    const plan = messagesFor(
      { type: 'WEEKEND_REMINDER', requestId: REQUEST_ID },
      ctx(),
      SITE
    );
    expect(plan.messages[0].html.toString()).toContain(
      `${SITE}/requester/dashboard`
    );
  });

  it('links a guest to their status page', () => {
    const plan = messagesFor(
      { type: 'GUEST_SUBMISSION_RECEIVED', requestId: REQUEST_ID },
      ctx({ requester: guest }),
      SITE
    );
    expect(plan.messages[0].to).toBe('jane@guest.test');
    expect(plan.messages[0].html.toString()).toContain(
      `${SITE}/weekend-access/access-token`
    );
  });
});
