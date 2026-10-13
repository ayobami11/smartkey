import { formatDateTimeTz, formatTimeTz } from '@/lib/dates';
import {
  markup,
  nBadge,
  nBtn,
  nCodePanel,
  nDetailPanel,
  nDetailRow,
  nEyebrow,
  nGreeting,
  nGuestBadge,
  nInlineBadge,
  nMismatchPanel,
  nMismatchRow,
  nNote,
  nP,
  nSecondary,
  nSmallLabel,
  nWrap,
} from '@/lib/email/html';
import type { EmailContent } from '@/lib/email/transport';

// Request-lifecycle templates. Pure: data in, subject + HTML out. Who gets
// them, and whether they are sent at all, is decided in
// src/lib/notifications/rules.ts. Every value is plain text and is escaped
// by `markup`; dates arrive already formatted for display.

export const collectionCodeEmail = ({
  fullName,
  code,
  codeExpiresAt,
  keyCode,
  roomName,
}: {
  fullName: string;
  code: string;
  codeExpiresAt: string;
  keyCode: string;
  roomName: string;
}): EmailContent => ({
  subject: 'Your SmartKey collection code',
  html: nWrap(
    markup`
        ${nEyebrow('Collection code')}
        ${nGreeting(`Ready for pickup, ${fullName}`)}
        ${nP(markup`This code is for <strong>${roomName} (${keyCode})</strong>. Present it at the security desk to collect the key.`)}
        ${nCodePanel(code, `Expires at ${formatTimeTz(codeExpiresAt)} - request a new one if it lapses`)}
      `,
    {
      preheader: `Your collection code for ${roomName} (${keyCode}) is ${code}.`,
    }
  ),
});

export const weekendSubmittedEmail = ({
  fullName,
  requesterName,
  unitName,
  roomLabel,
  requestedFor,
  link,
  decisionLink,
  isGuest,
}: {
  fullName: string;
  requesterName: string;
  unitName: string;
  roomLabel: string;
  requestedFor: string;
  link: string;
  // The one-click confirmation page for Dean-routed requests. Never a bare
  // GET action — mail scanners prefetch links, so the decision only happens
  // on an explicit click on that page. Absent for Administration requests.
  decisionLink?: string;
  // Rendered as the cyan External badge used on the dashboards.
  isGuest?: boolean;
}): EmailContent => ({
  subject: 'New weekend access request awaiting your review',
  html: nWrap(
    markup`
        ${nEyebrow(markup`Weekend request &middot; awaiting review`)}
        ${nGreeting(`Dear ${fullName},`)}
        ${isGuest ? markup`<div style="margin:0 0 12px;">${nGuestBadge()}</div>` : ''}
        ${nP(markup`<strong>${requesterName}</strong> has requested <strong>${roomLabel}</strong> in ${unitName} for <strong>${requestedFor}</strong>.`)}
        ${
          decisionLink
            ? markup`
              ${nBtn('Make a decision', decisionLink)}
              ${nP('You will approve or decline on the next page. Nothing is decided yet.', 10)}
              ${nSecondary('Or review on the dashboard', link)}
            `
            : nBtn('Review request', link)
        }
      `,
    {
      preferenceNote: true,
      preheader: `${requesterName} has requested ${roomLabel} in ${unitName} for ${requestedFor}. Review needed.`,
    }
  ),
});

export const weekendApprovedEmail = ({
  fullName,
  link,
  requestedFor,
  keyCode,
  roomName,
}: {
  fullName: string;
  link: string;
  requestedFor: string;
  keyCode: string;
  roomName: string;
}): EmailContent => ({
  subject: 'Your weekend key request has been approved',
  html: nWrap(
    markup`
        ${nEyebrow('Weekend access')}
        ${nBadge('Approved', 'success')}
        ${nGreeting(`Request approved, ${fullName}`)}
        ${nP(markup`Your weekend access request for <strong>${roomName} (${keyCode})</strong> on <strong>${requestedFor}</strong> has been approved.`)}
        ${nP('On the day, use the button below to generate your 6-digit collection code and present it at the security desk. The code is valid for 10 minutes once generated.')}
        ${nBtn('View your request', link)}
        ${nP('If you no longer need this key, you can cancel the request from the SmartKey app.', 0)}
      `,
    {
      preferenceNote: true,
      preheader: `Your weekend access request for ${roomName} (${keyCode}) has been approved.`,
    }
  ),
});

export const guestWeekendApprovedEmail = ({
  fullName,
  link,
  requestedFor,
  keyCode,
  roomName,
}: {
  fullName: string;
  link: string;
  requestedFor: string;
  keyCode: string;
  roomName: string;
}): EmailContent => ({
  subject: 'Your weekend access request has been approved',
  html: nWrap(
    markup`
        ${nEyebrow(markup`Weekend access &middot; external`)}
        <div style="margin:0 0 10px;">${nGuestBadge()}${nInlineBadge('Approved', 'success')}</div>
        ${nGreeting(`Request approved, ${fullName}`)}
        ${nP(markup`Your weekend access request for <strong>${roomName} (${keyCode})</strong> on <strong>${requestedFor}</strong> has been approved.`)}
        ${nP('On the day, use the button below to generate your 6-digit collection code and present it alongside your ID at the security desk. The code is valid for 10 minutes once generated.')}
        ${nBtn('Get your collection code', link)}
        ${nP('Keep this link private. Anyone with it can view your request.', 0)}
      `,
    {
      preheader: `Your weekend access request for ${roomName} (${keyCode}) has been approved.`,
    }
  ),
});

export const weekendDeclinedEmail = ({
  fullName,
  note,
}: {
  fullName: string;
  note?: string;
}): EmailContent => ({
  subject: 'Your weekend key request was not approved',
  html: nWrap(markup`
      ${nEyebrow('Weekend access')}
      ${nBadge('Not approved', 'error')}
      ${nGreeting(`Request not approved, ${fullName}`)}
      ${nP('Your weekend access request has not been approved.')}
      ${note ? markup`${nSmallLabel('Note from your authoriser')}${nNote(note)}` : ''}
      ${nP("Contact your faculty's Dean or the CSO if you believe this is an error.", 0)}
    `),
});

export const csoSignatureMismatchEmail = ({
  fullName,
  requesterName,
  keyCode,
  roomName,
  mismatches,
  thresholdPct,
  link,
}: {
  fullName: string;
  requesterName: string;
  keyCode: string;
  roomName: string;
  mismatches: { signature?: number; stamp?: number };
  thresholdPct: number;
  link: string;
}): EmailContent => ({
  subject: 'Signature/stamp mismatch held for review',
  html: nWrap(
    markup`
        ${nEyebrow('Signature review')}
        ${nBadge('Held for review', 'warning')}
        ${nGreeting(`Approval held, ${fullName}`)}
        ${nP(markup`<strong>${requesterName}</strong>'s weekend approval for <strong>${roomName} (${keyCode})</strong> is on hold. The submitted signature and/or stamp did not match the Dean's reference within the ${thresholdPct}% threshold.`)}
        ${nMismatchPanel([
          mismatches.signature !== undefined &&
            nMismatchRow('Signature', mismatches.signature),
          mismatches.stamp !== undefined &&
            nMismatchRow('Stamp', mismatches.stamp),
        ])}
        ${nBtn('Review on the dashboard', link)}
      `,
    {
      preferenceNote: true,
      preheader: `A signature or stamp mismatch is holding ${requesterName}'s weekend approval for ${roomName} (${keyCode}).`,
    }
  ),
});

export const guestSubmissionReceivedEmail = ({
  fullName,
  link,
}: {
  fullName: string;
  link: string;
}): EmailContent => ({
  subject: 'Your SmartKey weekend access request',
  html: nWrap(
    markup`
        ${nEyebrow(markup`Weekend access &middot; external`)}
        ${nBadge('Submitted', 'info')}
        ${nGreeting(`Request received, ${fullName}`)}
        ${nP('Your weekend access request has been submitted and is awaiting approval. Use the button below to track its status and, once approved, to get your collection code on the day.')}
        ${nBtn('Track your request', link)}
        ${nP('Keep this link private. Anyone with it can view your request.', 0)}
      `,
    {
      preheader:
        'Your weekend access request has been submitted and is awaiting approval.',
    }
  ),
});

export const weekendReminderEmail = ({
  fullName,
  link,
}: {
  fullName: string;
  link: string;
}): EmailContent => ({
  subject: 'Get your SmartKey collection code today',
  html: nWrap(
    markup`
        ${nEyebrow(markup`Weekend access &middot; today`)}
        ${nGreeting(`Today is the day, ${fullName}`)}
        ${nP('Your approved weekend key request is for today. Use the button below to generate your 6-digit collection code, then present it at the security desk.')}
        ${nBtn('Get your collection code', link)}
        ${nP('If you no longer need this key, you can safely ignore this email.', 0)}
      `,
    {
      preheader:
        'Your approved weekend access is for today. Get your collection code.',
    }
  ),
});

export const overdueReminderEmail = ({
  fullName,
  keyCode,
  roomName,
  returnDeadline,
}: {
  fullName: string;
  keyCode: string;
  roomName: string;
  returnDeadline: string;
}): EmailContent => ({
  subject: 'Your key is overdue for return',
  // No preferenceNote: also sent to guests, who have no settings page.
  html: nWrap(
    markup`
        ${nEyebrow('Key overdue')}
        ${nBadge('Action needed', 'error')}
        ${nGreeting(`Please return your key, ${fullName}`)}
        ${nP('This key was due back on the date below. Please return it to the security desk as soon as possible.')}
        ${nDetailPanel([
          nDetailRow('Key', `${roomName} (${keyCode})`),
          nDetailRow('Due', formatDateTimeTz(returnDeadline), true),
        ])}
        ${nP('This has been logged. Contact the CSO if you believe this is an error.', 0)}
      `,
    {
      preheader: `${roomName} (${keyCode}) is overdue for return.`,
    }
  ),
});
