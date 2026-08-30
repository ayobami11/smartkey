import { getGreeting, sendBrandedMail } from '@/lib/email/layout';

const NOTIFICATIONS_FOOTER_NOTE =
  'Turn this off in Settings &rarr; Notifications.';

export const sendOtpEmail = async ({
  to,
  code,
}: {
  to: string;
  code: string;
}) =>
  sendBrandedMail({
    to,
    subject: 'Your SmartKey verification code',
    preheader: `Your code is ${code}. It expires in 10 minutes.`,
    eyebrow: 'Sign-in code',
    bodyHtml: `
      <p style="margin:0 0 16px;color:#475569;font-size:14px;">Enter this code to finish signing in:</p>
      <div style="letter-spacing:10px;font-size:40px;font-family:monospace;font-weight:700;color:#0F172A;margin-bottom:16px;">${code}</div>
      <p style="margin:0;color:#94A3B8;font-size:12px;">Expires in 10&nbsp;minutes. Do not share this code.</p>
    `,
  });

export const sendActivationEmail = async ({
  to,
  link,
  isReinvite = false,
}: {
  to: string;
  link: string;
  isReinvite?: boolean;
}) =>
  sendBrandedMail({
    to,
    subject: isReinvite
      ? 'Your SmartKey access has been restored'
      : 'Activate your SmartKey account',
    preheader: isReinvite
      ? 'Set a new password to sign back in.'
      : 'Set up your account. This link expires in 24 hours.',
    eyebrow: isReinvite ? 'Access restored' : 'Account activation',
    bodyHtml: `
      <p style="margin:0 0 8px;color:#0F172A;font-size:16px;font-weight:600;">
        ${isReinvite ? 'Your access has been restored' : "You've been invited to join SmartKey"}
      </p>
      <p style="margin:0 0 24px;color:#475569;font-size:14px;">
        ${
          isReinvite
            ? 'Click the button below to set a new password and sign back in.'
            : 'Click the button below to set up your account. This link expires in 24&nbsp;hours.'
        }
      </p>
      <a href="${link}"
        style="display:inline-block;background:#7B1F2D;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
        ${isReinvite ? 'Restore access' : 'Activate account'}
      </a>
      <p style="margin:24px 0 0;color:#94A3B8;font-size:12px;">
        If you did not expect this email, you can safely ignore it.
      </p>
    `,
  });

export const sendWeekendReminderEmail = async ({
  to,
  link,
  fullName,
}: {
  to: string;
  link: string;
  fullName: string;
}) =>
  sendBrandedMail({
    to,
    subject: 'Get your SmartKey collection code today',
    preheader: 'Your approved weekend key collection is today.',
    eyebrow: 'Weekend request',
    bodyHtml: `
      <p style="margin:0 0 8px;color:#0F172A;font-size:16px;font-weight:600;">
        Your weekend key collection is today, ${fullName}
      </p>
      <p style="margin:0 0 24px;color:#475569;font-size:14px;">
        Your approved weekend key request is for today. Open the link below to
        generate your 6-digit collection code, then present it at the security
        desk. The code is valid for 10&nbsp;minutes once generated.
      </p>
      <a href="${link}"
        style="display:inline-block;background:#7B1F2D;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
        Get your collection code
      </a>
      <p style="margin:24px 0 0;color:#94A3B8;font-size:12px;">
        If you no longer need this key, you can ignore this email.
      </p>
    `,
  });

export const sendWeekendApprovedEmail = async ({
  to,
  fullName,
  link,
  requestedFor,
  keyCode,
  roomName,
}: {
  to: string;
  fullName: string;
  link: string;
  requestedFor: string;
  keyCode: string;
  roomName: string;
}) =>
  sendBrandedMail({
    to,
    subject: 'Your weekend key request has been approved',
    preheader: `Approved for ${roomName} (${keyCode}) on ${requestedFor}.`,
    eyebrow: 'Weekend request',
    footerNote: NOTIFICATIONS_FOOTER_NOTE,
    bodyHtml: `
      <p style="margin:0 0 8px;color:#0F172A;font-size:16px;font-weight:600;">
        Request approved, ${fullName}
      </p>
      <p style="margin:0 0 8px;color:#475569;font-size:14px;">
        Your weekend access request for <strong>${roomName} (${keyCode})</strong>
        on <strong>${requestedFor}</strong> has been approved.
      </p>
      <p style="margin:0 0 24px;color:#475569;font-size:14px;">
        On the day, open the link below to generate your 6-digit collection code.
        Present it at the security desk. The code is valid for 10&nbsp;minutes once generated.
      </p>
      <a href="${link}"
        style="display:inline-block;background:#7B1F2D;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
        View your request
      </a>
      <p style="margin:24px 0 0;color:#94A3B8;font-size:12px;">
        If you no longer need this key, you can cancel it from your SmartKey dashboard.
      </p>
    `,
  });

export const sendWeekendDeclinedEmail = async ({
  to,
  fullName,
  note,
}: {
  to: string;
  fullName: string;
  note?: string;
}) =>
  sendBrandedMail({
    to,
    subject: 'Your weekend key request was not approved',
    preheader: "Your weekend access request wasn't approved this time.",
    eyebrow: 'Weekend request',
    footerNote: NOTIFICATIONS_FOOTER_NOTE,
    bodyHtml: `
      <p style="margin:0 0 8px;color:#0F172A;font-size:16px;font-weight:600;">
        Request not approved, ${fullName}
      </p>
      <p style="margin:0 0 ${note ? '8px' : '24px'};color:#475569;font-size:14px;">
        Your weekend access request wasn't approved this time.
      </p>
      ${note ? `<p style="margin:0 0 24px;color:#475569;font-size:14px;">Note from your authoriser: ${note}</p>` : ''}
      <p style="margin:0;color:#94A3B8;font-size:12px;">
        Contact your faculty's Dean or the CSO if you believe this is an error.
      </p>
    `,
  });

export const sendGuestWeekendApprovedEmail = async ({
  to,
  fullName,
  link,
  requestedFor,
  keyCode,
  roomName,
}: {
  to: string;
  fullName: string;
  link: string;
  requestedFor: string;
  keyCode: string;
  roomName: string;
}) =>
  sendBrandedMail({
    to,
    subject: 'Your weekend access request has been approved',
    preheader: `Approved for ${roomName} (${keyCode}) on ${requestedFor}.`,
    eyebrow: 'Weekend request',
    bodyHtml: `
      <p style="margin:0 0 8px;color:#0F172A;font-size:16px;font-weight:600;">
        Request approved, ${fullName}
      </p>
      <p style="margin:0 0 8px;color:#475569;font-size:14px;">
        Your weekend access request for <strong>${roomName} (${keyCode})</strong>
        on <strong>${requestedFor}</strong> has been approved.
      </p>
      <p style="margin:0 0 24px;color:#475569;font-size:14px;">
        On the day, use the link below to generate your 6-digit collection code and
        present it alongside your ID at the security desk. The code is valid for
        10&nbsp;minutes once generated.
      </p>
      <a href="${link}"
        style="display:inline-block;background:#7B1F2D;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
        Get your collection code
      </a>
      <p style="margin:24px 0 0;color:#94A3B8;font-size:12px;">
        Keep this link private. Anyone with it can view your request.
      </p>
    `,
  });

export const sendPasswordResetEmail = async ({
  to,
  link,
}: {
  to: string;
  link: string;
}) =>
  sendBrandedMail({
    to,
    subject: 'Reset your SmartKey password',
    preheader: 'Set a new password. This link expires in 30 minutes.',
    eyebrow: 'Password reset',
    bodyHtml: `
      <p style="margin:0 0 8px;color:#0F172A;font-size:16px;font-weight:600;">
        Reset your password
      </p>
      <p style="margin:0 0 24px;color:#475569;font-size:14px;">
        Click the button below to set a new password. This link expires in 30&nbsp;minutes.
      </p>
      <a href="${link}"
        style="display:inline-block;background:#7B1F2D;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
        Reset password
      </a>
      <p style="margin:24px 0 0;color:#94A3B8;font-size:12px;">
        If you did not request a password reset, you can safely ignore this email.
      </p>
    `,
  });

export const sendCollectionCodeEmail = async ({
  to,
  fullName,
  code,
  codeExpiresAt,
  keyCode,
  roomName,
}: {
  to: string;
  fullName: string;
  code: string;
  codeExpiresAt: string;
  keyCode: string;
  roomName: string;
}) => {
  const expiresAtLabel = new Date(codeExpiresAt).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return sendBrandedMail({
    to,
    subject: 'Your SmartKey collection code',
    preheader: `Your code is ${code}. Present it at the security desk for ${roomName}.`,
    eyebrow: 'Collection code',
    bodyHtml: `
      <p style="margin:0 0 8px;color:#0F172A;font-size:16px;font-weight:600;">
        Your collection code, ${fullName}
      </p>
      <p style="margin:0 0 16px;color:#475569;font-size:14px;">
        For <strong>${roomName} (${keyCode})</strong>. Present this code at
        the security desk to collect the key.
      </p>
      <div style="letter-spacing:10px;font-size:40px;font-family:monospace;font-weight:700;color:#0F172A;margin-bottom:16px;">${code}</div>
      <p style="margin:0;color:#94A3B8;font-size:12px;">
        Expires at ${expiresAtLabel}. If it expires, request a new code from the app.
      </p>
    `,
  });
};

export const sendOverdueReminderEmail = async ({
  to,
  fullName,
  keyCode,
  roomName,
  returnDeadline,
}: {
  to: string;
  fullName: string;
  keyCode: string;
  roomName: string;
  returnDeadline: string;
}) => {
  const deadlineLabel = new Date(returnDeadline).toLocaleString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

  return sendBrandedMail({
    to,
    subject: 'Your key is overdue',
    preheader: `${roomName} (${keyCode}) was due back by ${deadlineLabel}.`,
    eyebrow: 'Overdue key',
    footerNote: NOTIFICATIONS_FOOTER_NOTE,
    bodyHtml: `
      <p style="margin:0 0 8px;color:#0F172A;font-size:16px;font-weight:600;">
        Your key is overdue, ${fullName}
      </p>
      <p style="margin:0 0 24px;color:#475569;font-size:14px;">
        <strong>${roomName} (${keyCode})</strong> was due back by
        <strong>${deadlineLabel}</strong>. Please return it to the security
        desk as soon as possible.
      </p>
      <p style="margin:0;color:#94A3B8;font-size:12px;">
        This has been logged. Contact the CSO if you believe this is an error.
      </p>
    `,
  });
};

export const sendWeekendSubmittedEmail = async ({
  to,
  fullName,
  requesterName,
  unitName,
  roomLabel,
  requestedFor,
  link,
  decisionLink,
  isGuest,
}: {
  to: string;
  fullName: string;
  requesterName: string;
  unitName: string;
  roomLabel: string;
  requestedFor: string;
  link: string;
  // Present for both registered-requester and guest requests routed to a
  // Dean-authorised unit — the entry point to a confirmation page (never a
  // bare GET action — mail scanners prefetch links, so the decision only
  // ever happens on an explicit click on that page). Absent only when no
  // Dean-authorised recipient resolves at all (Administration units).
  decisionLink?: string;
  // External (guest) requester, distinct from a registered staff member —
  // rendered as a small badge next to their name so the Dean can tell at a
  // glance, matching the same cyan GuestBadge treatment used on the
  // dashboard and the confirmation page.
  isGuest?: boolean;
}) =>
  sendBrandedMail({
    to,
    subject: 'New weekend access request awaiting your review',
    preheader: `${requesterName} requested ${roomLabel} in ${unitName} for ${requestedFor}.`,
    eyebrow: 'Weekend request',
    footerNote: NOTIFICATIONS_FOOTER_NOTE,
    bodyHtml: `
      <p style="margin:0 0 4px;color:#0F172A;font-size:16px;font-weight:600;">
        Weekend access request
      </p>
      <p style="margin:0 0 20px;color:#475569;font-size:14px;">
        ${getGreeting()}, ${fullName}
      </p>
      <p style="margin:0 0 24px;color:#475569;font-size:14px;">
        <strong>${requesterName}</strong>${
          isGuest
            ? ` <span style="display:inline-block;background:#CFFAFE;color:#0E7490;font-size:11px;font-weight:600;padding:2px 8px;border-radius:9999px;vertical-align:middle;">External</span>`
            : ''
        } has requested <strong>${roomLabel}</strong> in ${unitName}
        for <strong>${requestedFor}</strong>.
      </p>
      ${
        decisionLink
          ? `
      <a href="${decisionLink}"
        style="display:inline-block;background:#7B1F2D;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
        Make a decision
      </a>
      <p style="margin:16px 0 0;color:#94A3B8;font-size:12px;">
        You'll approve or decline on the next page — nothing is decided yet.
      </p>
      <a href="${link}" style="display:inline-block;margin-top:16px;color:#7B1F2D;font-size:13px;font-weight:600;text-decoration:underline;">
        Or review on the dashboard
      </a>
      `
          : `
      <a href="${link}"
        style="display:inline-block;background:#7B1F2D;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
        Review request
      </a>
      `
      }
    `,
  });

export const sendCsoSignatureMismatchEmail = async ({
  to,
  fullName,
  requesterName,
  keyCode,
  roomName,
  mismatches,
  thresholdPct,
  link,
}: {
  to: string;
  fullName: string;
  requesterName: string;
  keyCode: string;
  roomName: string;
  mismatches: { signature?: number; stamp?: number };
  thresholdPct: number;
  link: string;
}) => {
  const mismatchLines = [
    mismatches.signature !== undefined
      ? `Signature: ${mismatches.signature}% different`
      : null,
    mismatches.stamp !== undefined
      ? `Stamp: ${mismatches.stamp}% different`
      : null,
  ].filter((line): line is string => line !== null);

  return sendBrandedMail({
    to,
    subject: 'Signature or stamp mismatch — review needed',
    preheader: `${requesterName}'s approval for ${roomName} (${keyCode}) is on hold.`,
    eyebrow: 'Signature review',
    footerNote: NOTIFICATIONS_FOOTER_NOTE,
    bodyHtml: `
      <p style="margin:0 0 20px;color:#475569;font-size:14px;">
        ${getGreeting()}, ${fullName}
      </p>
      <p style="margin:0 0 8px;color:#0F172A;font-size:16px;font-weight:600;">
        Approval held
      </p>
      <p style="margin:0 0 8px;color:#475569;font-size:14px;">
        <strong>${requesterName}</strong>'s weekend approval for
        <strong>${roomName} (${keyCode})</strong> is on hold — the
        submitted signature and/or stamp didn't match the Dean's
        reference within the ${thresholdPct}% threshold.
      </p>
      <p style="margin:0 0 24px;color:#475569;font-size:14px;">
        ${mismatchLines.join(' &middot; ')}
      </p>
      <a href="${link}"
        style="display:inline-block;background:#7B1F2D;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
        Review on the dashboard
      </a>
    `,
  });
};

const formatDigestDate = (d: Date) => {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

// Shared stat-row markup for the two digest emails below.
const digestRow = (label: string, value: number, attention = false) => `
  <tr style="border-bottom:1px solid #F1F5F9;">
    <td style="padding:10px 0;color:#475569;font-size:14px;">${label}</td>
    <td style="padding:10px 0;color:${attention && value > 0 ? '#DC2626' : '#0F172A'};font-size:14px;font-weight:600;text-align:right;">${value}</td>
  </tr>
`;

export const sendDeanDigestEmail = async ({
  to,
  fullName,
  stats,
}: {
  to: string;
  fullName: string;
  stats: {
    issued_count: number;
    returned_count: number;
    overdue_count: number;
    weekend_submitted_count: number;
    weekend_pending_count: number;
  };
}) =>
  sendBrandedMail({
    to,
    subject: "Your faculty's daily activity digest",
    preheader: `${stats.issued_count} issued, ${stats.overdue_count} overdue, ${stats.weekend_pending_count} awaiting your decision.`,
    eyebrow: 'Daily digest',
    footerNote: NOTIFICATIONS_FOOTER_NOTE,
    bodyHtml: `
      <p style="margin:0 0 4px;color:#0F172A;font-size:17px;font-weight:600;">
        ${getGreeting()}, ${fullName}
      </p>
      <p style="margin:0 0 20px;color:#64748B;font-size:12px;">
        Faculty activity for the last 24 hours (${formatDigestDate(new Date())})
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${digestRow('Keys issued', stats.issued_count)}
        ${digestRow('Keys returned', stats.returned_count)}
        ${digestRow('Keys currently overdue', stats.overdue_count, true)}
        ${digestRow('Weekend requests submitted', stats.weekend_submitted_count)}
        ${digestRow('Weekend requests awaiting your decision', stats.weekend_pending_count, true)}
      </table>
    `,
  });

export const sendCsoDigestEmail = async ({
  to,
  fullName,
  stats,
}: {
  to: string;
  fullName: string;
  stats: {
    issued_count: number;
    returned_count: number;
    overdue_count: number;
    high_risk_count: number;
    signature_mismatch_count: number;
    incidents_count: number;
  };
}) =>
  sendBrandedMail({
    to,
    subject: "SmartKey's daily activity digest",
    preheader: `${stats.issued_count} issued, ${stats.overdue_count} overdue, ${stats.incidents_count} incidents logged.`,
    eyebrow: 'Daily digest',
    footerNote: NOTIFICATIONS_FOOTER_NOTE,
    bodyHtml: `
      <p style="margin:0 0 4px;color:#0F172A;font-size:17px;font-weight:600;">
        ${getGreeting()}, ${fullName}
      </p>
      <p style="margin:0 0 20px;color:#64748B;font-size:12px;">
        Building-wide activity for the last 24 hours (${formatDigestDate(new Date())})
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${digestRow('Keys issued', stats.issued_count)}
        ${digestRow('Keys returned', stats.returned_count)}
        ${digestRow('Keys currently overdue', stats.overdue_count, true)}
        ${digestRow('High-risk requests', stats.high_risk_count, true)}
        ${digestRow('Signature mismatches', stats.signature_mismatch_count, true)}
        ${digestRow('Incidents logged', stats.incidents_count, true)}
      </table>
    `,
  });

export const sendGuestWeekendEmail = async ({
  to,
  link,
  fullName,
}: {
  to: string;
  link: string;
  fullName: string;
}) =>
  sendBrandedMail({
    to,
    subject: 'Your SmartKey weekend access request',
    preheader: 'Your request is submitted and awaiting approval.',
    eyebrow: 'Weekend request',
    bodyHtml: `
      <p style="margin:0 0 8px;color:#0F172A;font-size:16px;font-weight:600;">
        Request received, ${fullName}
      </p>
      <p style="margin:0 0 24px;color:#475569;font-size:14px;">
        Your weekend access request has been submitted and is awaiting approval.
        Use the link below to track its status and, once approved, to get your
        collection code on the day.
      </p>
      <a href="${link}"
        style="display:inline-block;background:#7B1F2D;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
        Track your request
      </a>
      <p style="margin:24px 0 0;color:#94A3B8;font-size:12px;">
        Keep this link private. Anyone with it can view your request.
      </p>
    `,
  });
