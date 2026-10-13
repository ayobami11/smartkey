import { after } from 'next/server';

import { gmailTransport, siteUrl, type Transport } from '@/lib/email/transport';
import { logger } from '@/lib/logger';
import {
  loadNotificationContext,
  type LoadContext,
} from '@/lib/notifications/context';
import { messagesFor, type RequestEvent } from '@/lib/notifications/rules';

// The request notifications module. Callers say what happened to a request;
// this decides who is emailed, applies their preferences, and sends.
//
//   notifyAfterResponse(event) — for routes: runs after the response is sent
//   await notify(event)        — for crons, which count outcomes and stamp rows
//
// Never throws: a failed send is logged and reported as 'failed'.

export type { RequestEvent } from '@/lib/notifications/rules';

export type DeliveryOutcome = 'sent' | 'suppressed' | 'no_recipient' | 'failed';

export type NotifyPorts = {
  load: LoadContext;
  transport: Transport;
  siteUrl: string;
};

const defaultPorts = (): NotifyPorts => ({
  load: loadNotificationContext,
  transport: gmailTransport,
  siteUrl: siteUrl(),
});

export const notify = async (
  event: RequestEvent,
  ports: NotifyPorts = defaultPorts()
): Promise<DeliveryOutcome> => {
  try {
    const ctx = await ports.load(event.requestId);
    if (!ctx) {
      logger.error('notify: request not found', {
        event: event.type,
        requestId: event.requestId,
      });
      return 'no_recipient';
    }

    const plan = messagesFor(event, ctx, ports.siteUrl);
    if (plan.skipped) return plan.skipped;

    // One failed recipient does not stop the others (several CSOs may be
    // emailed for one event).
    const results = await Promise.allSettled(
      plan.messages.map((message) => ports.transport.send(message))
    );
    const failures = results.filter((r) => r.status === 'rejected');
    for (const failure of failures) {
      logger.error('notify: send failed', {
        event: event.type,
        requestId: event.requestId,
        err:
          failure.reason instanceof Error
            ? failure.reason.message
            : String(failure.reason),
      });
    }
    return failures.length === results.length ? 'failed' : 'sent';
  } catch (e) {
    logger.error('notify: failed', {
      event: event.type,
      requestId: event.requestId,
      err: e instanceof Error ? e.message : String(e),
    });
    return 'failed';
  }
};

// after(): Vercel may freeze the function once the response is sent, so an
// unawaited promise could be cut off mid-send.
export const notifyAfterResponse = (event: RequestEvent) => {
  after(() => notify(event));
};
