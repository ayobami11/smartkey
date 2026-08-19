import { setDefaultResultOrder } from 'node:dns';

import nodemailer from 'nodemailer';

setDefaultResultOrder('ipv4first');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
  // Without these, a blocked or filtered port 587 hangs on the OS TCP timeout
  // (~20s observed locally), which overruns the serverless function budget on
  // Vercel and makes login appear to freeze rather than fail.
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 15_000,
  dnsTimeout: 5_000,
});

const emailHeader = `
  <div style="background:#7B1F2D;padding:16px 24px;border-radius:8px 8px 0 0;">
    <span style="color:#fff;font-size:18px;font-weight:600;">SmartKey</span>
  </div>
`;

export const sendOtpEmail = async ({
  to,
  code,
}: {
  to: string;
  code: string;
}) =>
  transporter.sendMail({
    from: `"SmartKey" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'Your SmartKey verification code',
    html: `
      <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:400px;margin:0 auto;padding:32px 16px;">
        ${emailHeader}
        <div style="background:#fff;border:1px solid #E2E8F0;border-top:none;padding:32px 24px;border-radius:0 0 8px 8px;">
          <p style="margin:0 0 16px;color:#475569;font-size:14px;">Your sign-in verification code:</p>
          <div style="letter-spacing:10px;font-size:40px;font-family:monospace;font-weight:700;color:#0F172A;margin-bottom:16px;">${code}</div>
          <p style="margin:0;color:#94A3B8;font-size:12px;">Expires in 10&nbsp;minutes. Do not share this code.</p>
        </div>
      </div>
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
  transporter.sendMail({
    from: `"SmartKey" <${process.env.GMAIL_USER}>`,
    to,
    subject: isReinvite
      ? 'Your SmartKey access has been restored'
      : 'Activate your SmartKey account',
    html: `
      <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:400px;margin:0 auto;padding:32px 16px;">
        ${emailHeader}
        <div style="background:#fff;border:1px solid #E2E8F0;border-top:none;padding:32px 24px;border-radius:0 0 8px 8px;">
          <p style="margin:0 0 8px;color:#0F172A;font-size:16px;font-weight:600;">
            ${isReinvite ? 'Your access has been restored' : "You've been invited to SmartKey"}
          </p>
          <p style="margin:0 0 24px;color:#475569;font-size:14px;">
            ${
              isReinvite
                ? 'Click the button below to set a new password and log back in.'
                : 'Click the button below to set up your account. This link expires in 24 hours.'
            }
          </p>
          <a href="${link}"
            style="display:inline-block;background:#7B1F2D;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
            ${isReinvite ? 'Restore access' : 'Activate account'}
          </a>
          <p style="margin:24px 0 0;color:#94A3B8;font-size:12px;">
            If you did not expect this email, you can safely ignore it.
          </p>
        </div>
      </div>
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
  transporter.sendMail({
    from: `"SmartKey" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'Get your SmartKey collection code today',
    html: `
      <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:400px;margin:0 auto;padding:32px 16px;">
        ${emailHeader}
        <div style="background:#fff;border:1px solid #E2E8F0;border-top:none;padding:32px 24px;border-radius:0 0 8px 8px;">
          <p style="margin:0 0 8px;color:#0F172A;font-size:16px;font-weight:600;">
            Your weekend access is for today, ${fullName}
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
        </div>
      </div>
    `,
  });

// Approval notification for a registered requester's weekend request.
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
  transporter.sendMail({
    from: `"SmartKey" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'Your weekend key request has been approved',
    html: `
      <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:400px;margin:0 auto;padding:32px 16px;">
        ${emailHeader}
        <div style="background:#fff;border:1px solid #E2E8F0;border-top:none;padding:32px 24px;border-radius:0 0 8px 8px;">
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
            If you no longer need this key, you can cancel the request from the SmartKey app.
          </p>
        </div>
      </div>
    `,
  });

// Decline notification for a registered requester's weekend request.
export const sendWeekendDeclinedEmail = async ({
  to,
  fullName,
  note,
}: {
  to: string;
  fullName: string;
  note?: string;
}) =>
  transporter.sendMail({
    from: `"SmartKey" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'Your weekend key request was not approved',
    html: `
      <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:400px;margin:0 auto;padding:32px 16px;">
        ${emailHeader}
        <div style="background:#fff;border:1px solid #E2E8F0;border-top:none;padding:32px 24px;border-radius:0 0 8px 8px;">
          <p style="margin:0 0 8px;color:#0F172A;font-size:16px;font-weight:600;">
            Request not approved, ${fullName}
          </p>
          <p style="margin:0 0 ${note ? '8px' : '24px'};color:#475569;font-size:14px;">
            Your weekend access request has not been approved.
          </p>
          ${note ? `<p style="margin:0 0 24px;color:#475569;font-size:14px;">Note from your authoriser: ${note}</p>` : ''}
          <p style="margin:0;color:#94A3B8;font-size:12px;">
            Contact your faculty's Dean or the CSO if you believe this is an error.
          </p>
        </div>
      </div>
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
  transporter.sendMail({
    from: `"SmartKey" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'Your weekend access request has been approved',
    html: `
      <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:400px;margin:0 auto;padding:32px 16px;">
        ${emailHeader}
        <div style="background:#fff;border:1px solid #E2E8F0;border-top:none;padding:32px 24px;border-radius:0 0 8px 8px;">
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
        </div>
      </div>
    `,
  });

export const sendPasswordResetEmail = async ({
  to,
  link,
}: {
  to: string;
  link: string;
}) =>
  transporter.sendMail({
    from: `"SmartKey" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'Reset your SmartKey password',
    html: `
      <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:400px;margin:0 auto;padding:32px 16px;">
        ${emailHeader}
        <div style="background:#fff;border:1px solid #E2E8F0;border-top:none;padding:32px 24px;border-radius:0 0 8px 8px;">
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
        </div>
      </div>
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

  return transporter.sendMail({
    from: `"SmartKey" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'Your SmartKey collection code',
    html: `
      <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:400px;margin:0 auto;padding:32px 16px;">
        ${emailHeader}
        <div style="background:#fff;border:1px solid #E2E8F0;border-top:none;padding:32px 24px;border-radius:0 0 8px 8px;">
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
        </div>
      </div>
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

  return transporter.sendMail({
    from: `"SmartKey" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'Your key is overdue for return',
    html: `
      <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:400px;margin:0 auto;padding:32px 16px;">
        ${emailHeader}
        <div style="background:#fff;border:1px solid #E2E8F0;border-top:none;padding:32px 24px;border-radius:0 0 8px 8px;">
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
        </div>
      </div>
    `,
  });
};

export const sendWeekendSubmittedEmail = async ({
  to,
  fullName,
  requesterName,
  unitName,
  requestedFor,
  link,
  decisionLink,
}: {
  to: string;
  fullName: string;
  requesterName: string;
  unitName: string;
  requestedFor: string;
  link: string;
  // Present only for registered-requester requests routed to a Dean —
  // guest requests need a key assigned at approval time, which a one-click
  // email action can't supply, so they never get this link. When present,
  // it's the entry point to a confirmation page (never a bare GET action —
  // mail scanners prefetch links, so the decision only ever happens on an
  // explicit click on that page).
  decisionLink?: string;
}) =>
  transporter.sendMail({
    from: `"SmartKey" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'New weekend access request awaiting your review',
    html: `
      <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:400px;margin:0 auto;padding:32px 16px;">
        ${emailHeader}
        <div style="background:#fff;border:1px solid #E2E8F0;border-top:none;padding:32px 24px;border-radius:0 0 8px 8px;">
          <p style="margin:0 0 8px;color:#0F172A;font-size:16px;font-weight:600;">
            New weekend request, ${fullName}
          </p>
          <p style="margin:0 0 24px;color:#475569;font-size:14px;">
            <strong>${requesterName}</strong> has requested weekend access in
            <strong>${unitName}</strong> for <strong>${requestedFor}</strong>.
            It's awaiting your review.
          </p>
          ${
            decisionLink
              ? `
          <table role="presentation" style="border-collapse:collapse;">
            <tr>
              <td style="padding-right:8px;">
                <a href="${decisionLink}"
                  style="display:inline-block;background:#7B1F2D;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
                  Approve
                </a>
              </td>
              <td>
                <a href="${decisionLink}"
                  style="display:inline-block;background:#fff;color:#7B1F2D;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;border:1px solid #7B1F2D;">
                  Decline
                </a>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;color:#94A3B8;font-size:12px;">
            Both buttons open a confirmation page — nothing is decided until
            you click Approve or Decline there.
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
        </div>
      </div>
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

  return transporter.sendMail({
    from: `"SmartKey" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'Signature/stamp mismatch held for review',
    html: `
      <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:400px;margin:0 auto;padding:32px 16px;">
        ${emailHeader}
        <div style="background:#fff;border:1px solid #E2E8F0;border-top:none;padding:32px 24px;border-radius:0 0 8px 8px;">
          <p style="margin:0 0 8px;color:#0F172A;font-size:16px;font-weight:600;">
            Approval held, ${fullName}
          </p>
          <p style="margin:0 0 8px;color:#475569;font-size:14px;">
            <strong>${requesterName}</strong>'s weekend approval for
            <strong>${roomName} (${keyCode})</strong> is on hold — the
            submitted signature and/or stamp didn't match the Dean's
            reference within the ${thresholdPct}% threshold.
          </p>
          <p style="margin:0 0 24px;color:#475569;font-size:14px;">
            ${mismatchLines.join(' · ')}
          </p>
          <a href="${link}"
            style="display:inline-block;background:#7B1F2D;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
            Review on the dashboard
          </a>
        </div>
      </div>
    `,
  });
};

// The digest emails carry more institutional weight than a transactional OTP
// or confirmation mail — they read as a daily operational report
const digestHeader = `
  <table role="presentation" style="width:100%;border-collapse:collapse;background:#7B1F2D;border-radius:8px 8px 0 0;">
    <tr>
      <td style="padding:18px 24px;color:#fff;font-size:16px;font-weight:600;letter-spacing:0.01em;">
        SmartKey
      </td>
      <td style="padding:18px 24px;text-align:right;color:rgba(255,255,255,0.75);font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">
        Daily digest
      </td>
    </tr>
  </table>
`;

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

const digestFooter = `
  <p style="margin:16px 0 0;text-align:center;color:#94A3B8;font-size:11px;">
    SmartKey, University of Lagos Senate Building
  </p>
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
  transporter.sendMail({
    from: `"SmartKey" <${process.env.GMAIL_USER}>`,
    to,
    subject: "Your faculty's daily activity digest",
    html: `
      <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:440px;margin:0 auto;padding:32px 16px;">
        ${digestHeader}
        <div style="background:#fff;border:1px solid #E2E8F0;border-top:none;padding:28px 28px 24px;border-radius:0 0 8px 8px;">
          <p style="margin:0 0 4px;color:#0F172A;font-size:17px;font-weight:600;">
            Good morning, ${fullName}
          </p>
          <p style="margin:0 0 20px;color:#64748B;font-size:12px;">
            Faculty activity for the last 24 hours (${formatDigestDate(new Date())})
          </p>
          <table role="presentation" style="width:100%;border-collapse:collapse;">
            ${digestRow('Keys issued', stats.issued_count)}
            ${digestRow('Keys returned', stats.returned_count)}
            ${digestRow('Keys currently overdue', stats.overdue_count, true)}
            ${digestRow('Weekend requests submitted', stats.weekend_submitted_count)}
            ${digestRow('Weekend requests awaiting your decision', stats.weekend_pending_count, true)}
          </table>
          <p style="margin:20px 0 0;color:#94A3B8;font-size:12px;">
            You can turn this off in Settings → Notifications.
          </p>
        </div>
        ${digestFooter}
      </div>
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
  transporter.sendMail({
    from: `"SmartKey" <${process.env.GMAIL_USER}>`,
    to,
    subject: "SmartKey's daily activity digest",
    html: `
      <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:440px;margin:0 auto;padding:32px 16px;">
        ${digestHeader}
        <div style="background:#fff;border:1px solid #E2E8F0;border-top:none;padding:28px 28px 24px;border-radius:0 0 8px 8px;">
          <p style="margin:0 0 4px;color:#0F172A;font-size:17px;font-weight:600;">
            Good morning, ${fullName}
          </p>
          <p style="margin:0 0 20px;color:#64748B;font-size:12px;">
            Building-wide activity for the last 24 hours (${formatDigestDate(new Date())})
          </p>
          <table role="presentation" style="width:100%;border-collapse:collapse;">
            ${digestRow('Keys issued', stats.issued_count)}
            ${digestRow('Keys returned', stats.returned_count)}
            ${digestRow('Keys currently overdue', stats.overdue_count, true)}
            ${digestRow('High-risk requests', stats.high_risk_count, true)}
            ${digestRow('Signature mismatches', stats.signature_mismatch_count, true)}
            ${digestRow('Incidents logged', stats.incidents_count, true)}
          </table>
          <p style="margin:20px 0 0;color:#94A3B8;font-size:12px;">
            You can turn this off in Settings → Notifications.
          </p>
        </div>
        ${digestFooter}
      </div>
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
  transporter.sendMail({
    from: `"SmartKey" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'Your SmartKey weekend access request',
    html: `
      <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:400px;margin:0 auto;padding:32px 16px;">
        ${emailHeader}
        <div style="background:#fff;border:1px solid #E2E8F0;border-top:none;padding:32px 24px;border-radius:0 0 8px 8px;">
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
        </div>
      </div>
    `,
  });
