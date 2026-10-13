import { formatDateLongTz } from '@/lib/dates';
import {
  collectionCodeEmail,
  csoSignatureMismatchEmail,
  guestSubmissionReceivedEmail,
  guestWeekendApprovedEmail,
  overdueReminderEmail,
  weekendApprovedEmail,
  weekendDeclinedEmail,
  weekendReminderEmail,
  weekendSubmittedEmail,
} from '@/lib/email/templates/request';
import type { EmailContent, EmailMessage } from '@/lib/email/transport';
import type {
  NotificationContext,
  Person,
  Preferences,
} from '@/lib/notifications/context';

// Who gets which email, and when a preference stops it. Pure: a notification
// context in, messages out — no database, no SMTP — so every rule here is
// tested directly in src/tests/notifications/rules.test.ts.
//
// | Event                     | Recipient                   | Preference               |
// | ------------------------- | --------------------------- | ------------------------ |
// | CODE_ISSUED               | requester / guest           | —                        |
// | WEEKEND_SUBMITTED         | Dean (Dean units)           | weekend_submitted_email  |
// |                           | active CSOs (CSO units)     | weekend_submitted_email  |
// | WEEKEND_DECIDED           | registered requester        | weekend_decided_email    |
// |                           | guest (approval only)       | —                        |
// | SIGNATURE_MISMATCH        | active CSOs                 | signature_mismatch_email |
// | GUEST_SUBMISSION_RECEIVED | guest                       | —                        |
// | WEEKEND_REMINDER          | requester / guest           | —                        |
// | OVERDUE_REMINDER          | registered requester        | overdue_email            |
// |                           | guest                       | —                        |
//
// Every preference defaults to on: no notification_preferences row, or a
// null column, means send.

export type RequestEvent =
  | { type: 'CODE_ISSUED'; requestId: string }
  | { type: 'WEEKEND_SUBMITTED'; requestId: string }
  | {
      type: 'WEEKEND_DECIDED';
      requestId: string;
      decision: 'APPROVED' | 'DECLINED';
      note?: string;
    }
  | {
      type: 'SIGNATURE_MISMATCH';
      requestId: string;
      mismatches: { signature?: number; stamp?: number };
      thresholdPct: number;
    }
  | { type: 'GUEST_SUBMISSION_RECEIVED'; requestId: string }
  | { type: 'WEEKEND_REMINDER'; requestId: string }
  | { type: 'OVERDUE_REMINDER'; requestId: string };

// Why nothing was sent, when nothing was.
//   suppressed   — a preference or a rule says not to (e.g. guest declines)
//   no_recipient — nobody to send to: no email address, no Dean, no CSO
export type SkipReason = 'suppressed' | 'no_recipient';

export type MessagePlan =
  | { messages: EmailMessage[]; skipped: null }
  | { messages: []; skipped: SkipReason };

const skip = (reason: SkipReason): MessagePlan => ({
  messages: [],
  skipped: reason,
});

const allows = (prefs: Preferences | null, column: keyof Preferences) =>
  prefs?.[column] !== false;

const to = (address: string, content: EmailContent): EmailMessage => ({
  to: address,
  ...content,
});

// Sends to every listed person with an address whose preference allows it.
// When nobody qualifies, reports whether a preference was the reason.
const toEach = (
  people: Person[],
  column: keyof Preferences,
  build: (person: Person) => EmailContent
): MessagePlan => {
  const reachable = people.filter((p) => p.email);
  const allowed = reachable.filter((p) => allows(p.prefs, column));
  if (allowed.length === 0) {
    return skip(reachable.length > 0 ? 'suppressed' : 'no_recipient');
  }
  return {
    messages: allowed.map((p) => to(p.email!, build(p))),
    skipped: null,
  };
};

const longDate = (date: string | null) => (date ? formatDateLongTz(date) : '');

export const messagesFor = (
  event: RequestEvent,
  ctx: NotificationContext,
  siteUrl: string
): MessagePlan => {
  const { request, requester, key, unit } = ctx;
  const keyCode = key?.code ?? '';
  const roomName = key?.roomName ?? '';
  const guestLink = `${siteUrl}/weekend-access/${request.accessToken}`;

  switch (event.type) {
    case 'CODE_ISSUED': {
      if (!requester?.email || !request.code || !request.codeExpiresAt) {
        return skip('no_recipient');
      }
      return {
        messages: [
          to(
            requester.email,
            collectionCodeEmail({
              fullName: requester.name,
              code: request.code,
              codeExpiresAt: request.codeExpiresAt,
              keyCode,
              roomName,
            })
          ),
        ],
        skipped: null,
      };
    }

    case 'WEEKEND_SUBMITTED': {
      if (!unit || !requester) return skip('no_recipient');
      const isGuest = requester.kind === 'guest';
      const roomLabel = key
        ? `${key.roomName} (${key.code})`
        : request.requestedRoom || unit.name;
      const content = (fullName: string, link: string, decisionLink?: string) =>
        weekendSubmittedEmail({
          fullName,
          requesterName: requester.name,
          unitName: unit.name,
          roomLabel,
          requestedFor: longDate(request.requestedFor),
          link,
          decisionLink,
          isGuest,
        });

      if (unit.authoriser === 'CSO') {
        return toEach(ctx.csos, 'weekend_submitted_email', (cso) =>
          content(cso.name, `${siteUrl}/cso/weekend-requests`)
        );
      }
      // The one-click link exists only when the request was created with a
      // decision token, which create_request / create_guest_weekend_request
      // mint for Dean-routed weekend requests.
      return toEach(
        unit.dean ? [unit.dean] : [],
        'weekend_submitted_email',
        (dean) =>
          content(
            dean.name,
            `${siteUrl}/dean/weekend-requests`,
            request.decisionToken
              ? `${siteUrl}/dean-decision/${request.decisionToken}`
              : undefined
          )
      );
    }

    case 'WEEKEND_DECIDED': {
      if (!requester) return skip('no_recipient');
      const requestedFor = longDate(request.requestedFor);

      if (requester.kind === 'guest') {
        // Guests are not emailed a decline; their status page shows it.
        if (event.decision === 'DECLINED') return skip('suppressed');
        if (!requester.email) return skip('no_recipient');
        return {
          messages: [
            to(
              requester.email,
              guestWeekendApprovedEmail({
                fullName: requester.name,
                link: guestLink,
                requestedFor,
                keyCode,
                roomName,
              })
            ),
          ],
          skipped: null,
        };
      }

      return toEach([requester], 'weekend_decided_email', (person) =>
        event.decision === 'APPROVED'
          ? weekendApprovedEmail({
              fullName: person.name,
              link: `${siteUrl}/requester/request/${request.id}/code`,
              requestedFor,
              keyCode,
              roomName,
            })
          : weekendDeclinedEmail({ fullName: person.name, note: event.note })
      );
    }

    case 'SIGNATURE_MISMATCH':
      return toEach(ctx.csos, 'signature_mismatch_email', (cso) =>
        csoSignatureMismatchEmail({
          fullName: cso.name,
          requesterName: requester?.name ?? '',
          keyCode,
          roomName,
          mismatches: event.mismatches,
          thresholdPct: event.thresholdPct,
          link: `${siteUrl}/cso/dashboard`,
        })
      );

    case 'GUEST_SUBMISSION_RECEIVED': {
      if (requester?.kind !== 'guest' || !requester.email) {
        return skip('no_recipient');
      }
      return {
        messages: [
          to(
            requester.email,
            guestSubmissionReceivedEmail({
              fullName: requester.name,
              link: guestLink,
            })
          ),
        ],
        skipped: null,
      };
    }

    case 'WEEKEND_REMINDER': {
      if (!requester?.email) return skip('no_recipient');
      return {
        messages: [
          to(
            requester.email,
            weekendReminderEmail({
              fullName: requester.name,
              link:
                requester.kind === 'guest'
                  ? guestLink
                  : `${siteUrl}/requester/dashboard`,
            })
          ),
        ],
        skipped: null,
      };
    }

    case 'OVERDUE_REMINDER': {
      if (!requester || !request.returnDeadline) return skip('no_recipient');
      const returnDeadline = request.returnDeadline;
      const content = (fullName: string) =>
        overdueReminderEmail({
          fullName: fullName || 'there',
          keyCode,
          roomName,
          returnDeadline,
        });

      if (requester.kind === 'guest') {
        if (!requester.email) return skip('no_recipient');
        return {
          messages: [to(requester.email, content(requester.name))],
          skipped: null,
        };
      }
      return toEach([requester], 'overdue_email', (person) =>
        content(person.name)
      );
    }
  }
};
