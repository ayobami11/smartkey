import { setDefaultResultOrder } from 'node:dns';

import nodemailer from 'nodemailer';

import { getLogoAttachment, LOGO_CID } from '@/lib/email/logo';

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

// Every template renders the embedded logo in its header, so every send goes
// through here rather than repeating the attachment at each of the 14 call
// sites below.
const send = async (opts: Parameters<typeof transporter.sendMail>[0]) =>
  transporter.sendMail({ ...opts, attachments: [await getLogoAttachment()] });

// ---------------------------------------------------------------------------
// Design tokens and layout helpers. Mirrors design-system/DESIGN.md (maroon
// primary, gold accent, status colours) with email-safe font stacks standing
// in for Fraunces/DM Sans/JetBrains Mono — no external webfonts, since most
// inboxes (Outlook desktop and Gmail included) never load them. The header
// carries the real SmartKeyMark logo (src/lib/email/logo.ts) alongside the
// text wordmark, not instead of it — inline <svg> is unreliable in email
// clients, but a raster image sent as a cid attachment (getLogoAttachment)
// is standard practice and renders in Gmail, Outlook, and Apple Mail alike;
// the wordmark stays as real text so the header still reads with images off.
// ---------------------------------------------------------------------------

type Tone = 'success' | 'warning' | 'error' | 'info' | 'guest';

const N = {
  envelope: '#EEF2F6',
  border: '#E4E9EF',
  ink: '#0F172A',
  body: '#475569',
  faint: '#94A3B8',
  maroon: '#7B1F2D',
  gold: '#D4A437',
  success: '#10B981',
  successSoft: '#ECFDF5',
  successText: '#047857',
  warning: '#F59E0B',
  warningSoft: '#FFF7E6',
  warningText: '#B45309',
  error: '#DC2626',
  errorSoft: '#FEF2F2',
  errorText: '#B91C1C',
  info: '#3B82F6',
  infoSoft: '#EFF6FF',
  infoText: '#1D4ED8',
  guest: '#0E7490',
  guestSoft: '#CFFAFE',
};

const F_SERIF = `Georgia, 'Times New Roman', Times, serif`;
const F_SANS = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
const F_MONO = `ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace`;

// Padding after the visible preheader text: a run of zero-width joiners
// (each preceded by a non-breaking space so clients don't collapse them)
// stops the inbox preview from bleeding into the email's first visible line.
const PREHEADER_PAD = '&nbsp;&zwnj;'.repeat(40);

const nLogoMark = (size: number) =>
  `<img src="cid:${LOGO_CID}" width="${size}" height="${size}" alt="SmartKey" style="display:inline-block;vertical-align:middle;border:0;margin-right:9px;">`;

// nHeader, nDigestHeader, and nFooter each return bare <tr> rows, not a
// nested <table> of their own — a nested table set to width:100% is one of
// the least reliable things in HTML email rendering; plenty of clients
// shrink it to its content's intrinsic width instead of stretching it to
// fill the parent cell, which is exactly what made the maroon header render
// narrower than the white body below it. Returning rows directly means they
// become rows of nDoc's own fixed-width (480px) table, so their background
// always spans the true column width — nothing left to shrink.
const nHeader = () => `
  <tr><td style="background:${N.maroon};border-radius:12px 12px 0 0;padding:26px 30px 22px;">
    <div>${nLogoMark(26)}<span style="font-family:${F_SERIF};font-weight:700;font-size:21px;color:#ffffff;letter-spacing:0.01em;vertical-align:middle;">SmartKey</span></div>
    <div style="font-family:${F_SANS};font-size:9.5px;letter-spacing:0.15em;text-transform:uppercase;color:${N.gold};margin-top:6px;">Senate Building &middot; University of Lagos</div>
  </td></tr>
  <tr><td style="height:3px;line-height:3px;font-size:0;background:${N.gold};">&nbsp;</td></tr>
`;

const nDigestHeader = () => `
  <tr><td style="background:${N.maroon};border-radius:12px 12px 0 0;padding:20px 30px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle;">
        <div>${nLogoMark(20)}<span style="font-family:${F_SERIF};font-weight:700;font-size:18px;color:#ffffff;vertical-align:middle;">SmartKey</span></div>
      </td>
      <td style="text-align:right;vertical-align:middle;">
        <span style="font-family:${F_SANS};font-size:9.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${N.gold};">Daily digest</span>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="height:3px;line-height:3px;font-size:0;background:${N.gold};">&nbsp;</td></tr>
`;

const nFooter = (opts: { preferenceNote?: boolean } = {}) => `
  <tr><td style="background:#FAFBFC;border-left:1px solid ${N.border};border-right:1px solid ${N.border};border-bottom:1px solid ${N.border};border-radius:0 0 12px 12px;padding:20px 30px 22px;text-align:center;">
    <p style="margin:0 0 3px;font-family:${F_SERIF};font-size:13px;color:${N.ink};font-weight:600;">SmartKey</p>
    <p style="margin:0 0 12px;font-family:${F_SANS};font-size:10.5px;color:${N.faint};letter-spacing:0.02em;">Key management for the Senate Building</p>
    ${
      opts.preferenceNote
        ? `<p style="margin:0 0 8px;font-family:${F_SANS};font-size:11px;color:${N.faint};">You can turn this off in Settings &rarr; Notifications.</p>`
        : ''
    }
    <p style="margin:0;font-family:${F_SANS};font-size:10px;color:${N.faint};">University of Lagos &nbsp;&middot;&nbsp; Automated message, please do not reply directly.</p>
  </td></tr>
`;

const nDoc = (
  headerFn: () => string,
  contentInner: string,
  opts: { preheader?: string; preferenceNote?: boolean } = {}
) => `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>body{margin:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}</style>
</head>
<body style="margin:0;background:${N.envelope};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  ${
    opts.preheader
      ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${N.envelope};opacity:0;">${opts.preheader}${PREHEADER_PAD}</div>`
      : ''
  }
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:${N.envelope};">
    <tr><td align="center" style="padding:36px 16px;">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:100%;border-collapse:collapse;">
        ${headerFn()}
        <tr><td style="background:#ffffff;border-left:1px solid ${N.border};border-right:1px solid ${N.border};padding:30px 30px 26px;">
          ${contentInner}
        </td></tr>
        ${nFooter(opts)}
      </table>
    </td></tr>
  </table>
</body></html>`;

const nWrap = (
  inner: string,
  opts?: { preheader?: string; preferenceNote?: boolean }
) => nDoc(nHeader, inner, opts);

const nWrapDigest = (
  inner: string,
  opts?: { preheader?: string; preferenceNote?: boolean }
) => nDoc(nDigestHeader, inner, opts);

const nEyebrow = (text: string) =>
  `<p style="margin:0 0 7px;font-family:${F_SANS};font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${N.maroon};">${text}</p>`;

const nGreeting = (text: string) =>
  `<p style="margin:0 0 16px;font-family:${F_SERIF};font-size:21px;font-weight:600;color:${N.ink};line-height:1.3;">${text}</p>`;

const nP = (text: string, mb = 16) =>
  `<p style="margin:0 0 ${mb}px;font-family:${F_SANS};font-size:14px;line-height:1.65;color:${N.body};">${text}</p>`;

const nBtn = (label: string, href: string) => `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:2px 0 20px;"><tr>
    <td style="border-radius:8px;background:${N.maroon};">
      <a href="${href}" style="display:inline-block;padding:13px 26px;font-family:${F_SANS};font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;letter-spacing:0.01em;">${label}</a>
    </td>
  </tr></table>
`;

const nSecondary = (label: string, href: string) =>
  `<a href="${href}" style="font-family:${F_SANS};font-size:13px;font-weight:600;color:${N.maroon};text-decoration:underline;">${label}</a>`;

const nBadge = (label: string, tone: Tone) => {
  const map: Record<Tone, [string, string, string]> = {
    success: [N.successSoft, N.successText, N.success],
    warning: [N.warningSoft, N.warningText, N.warning],
    error: [N.errorSoft, N.errorText, N.error],
    info: [N.infoSoft, N.infoText, N.info],
    guest: [N.guestSoft, N.guest, N.guest],
  };
  const [bg, text, dot] = map[tone];
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr>
      <td style="padding:6px 12px 6px 10px;background:${bg};border-radius:999px;">
        <span style="display:inline-block;width:6px;height:6px;border-radius:999px;background:${dot};margin-right:7px;"></span>
        <span style="font-family:${F_SANS};font-size:11px;font-weight:700;letter-spacing:0.03em;text-transform:uppercase;color:${text};vertical-align:middle;">${label}</span>
      </td>
    </tr></table>
  `;
};

// Same visual as nBadge, but without the trailing margin, for placing inline
// next to another badge (e.g. the guest badge on the guest-approved email).
const nInlineBadge = (label: string, tone: Tone) =>
  nBadge(label, tone).replace(
    'style="margin:0 0 16px;"',
    'style="display:inline-table;margin:0 0 0 6px;"'
  );

const nCodePanel = (code: string, caption: string) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:2px 0 20px;background:#FAFAFB;border:1px solid ${N.border};border-radius:10px;">
    <tr><td style="padding:22px 24px;text-align:center;">
      <div style="font-family:${F_MONO};font-size:38px;font-weight:700;letter-spacing:9px;color:${N.ink};">${code}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px auto 0;"><tr>
        <td style="padding:4px 12px;border-radius:999px;background:${N.warningSoft};">
          <span style="font-family:${F_SANS};font-size:11.5px;font-weight:600;color:${N.warningText};">${caption}</span>
        </td>
      </tr></table>
    </td></tr>
  </table>
`;

const nNote = (text: string) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 18px;"><tr>
    <td style="border-left:3px solid ${N.maroon};background:#FAFAFB;padding:12px 16px;border-radius:0 6px 6px 0;">
      <span style="font-family:${F_SERIF};font-style:italic;font-size:13.5px;color:${N.body};line-height:1.6;">&ldquo;${text}&rdquo;</span>
    </td>
  </tr></table>
`;

const nSmallLabel = (text: string) =>
  `<p style="margin:0 0 6px;font-family:${F_SANS};font-size:10.5px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${N.faint};">${text}</p>`;

const nDetailRow = (label: string, value: string, emph = false) => `
  <tr>
    <td style="padding:9px 0;border-bottom:1px solid ${N.border};font-family:${F_SANS};font-size:11px;color:${N.faint};text-transform:uppercase;letter-spacing:0.06em;">${label}</td>
    <td style="padding:9px 0;border-bottom:1px solid ${N.border};font-family:${F_SANS};font-size:13.5px;font-weight:600;color:${emph ? N.error : N.ink};text-align:right;">${value}</td>
  </tr>
`;

const nDetailPanel = (rows: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;">${rows}</table>`;

const nMismatchRow = (label: string, pct: number) => `
  <tr>
    <td style="padding:8px 0;font-family:${F_SANS};font-size:13px;color:${N.body};">${label}</td>
    <td style="padding:8px 0;font-family:${F_MONO};font-size:13px;font-weight:700;color:${N.error};text-align:right;">${pct}%</td>
  </tr>
`;

const nDigestRow = (label: string, value: number, attention = false) => `
  <tr>
    <td style="padding:11px 0;border-bottom:1px solid ${N.border};font-family:${F_SANS};font-size:13.5px;color:${N.body};">
      ${attention && value > 0 ? `<span style="display:inline-block;width:6px;height:6px;border-radius:999px;background:${N.error};margin-right:8px;"></span>` : ''}${label}
    </td>
    <td style="padding:11px 0;border-bottom:1px solid ${N.border};font-family:${F_MONO};font-size:14px;font-weight:700;color:${attention && value > 0 ? N.error : N.ink};text-align:right;">${value}</td>
  </tr>
`;

const nGuestBadge = () =>
  `<span style="display:inline-block;background:${N.guestSoft};color:${N.guest};font-size:10.5px;font-weight:700;letter-spacing:0.02em;text-transform:uppercase;padding:2px 9px;border-radius:9999px;vertical-align:middle;">External</span>`;

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

// ---------------------------------------------------------------------------
// Email senders
// ---------------------------------------------------------------------------

export const sendOtpEmail = async ({
  to,
  code,
}: {
  to: string;
  code: string;
}) =>
  send({
    from: `"SmartKey" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'Your SmartKey verification code',
    html: nWrap(
      `
        ${nEyebrow('Sign-in verification')}
        ${nGreeting('Your verification code')}
        ${nP('Enter this code to finish signing in to SmartKey.')}
        ${nCodePanel(code, 'Expires in 10 minutes - do not share')}
      `,
      {
        preheader: `Your SmartKey verification code is ${code}. It expires in 10 minutes.`,
      }
    ),
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
  send({
    from: `"SmartKey" <${process.env.GMAIL_USER}>`,
    to,
    subject: isReinvite
      ? 'Your SmartKey access has been restored'
      : 'Activate your SmartKey account',
    html: nWrap(
      isReinvite
        ? `
          ${nEyebrow('Access restored')}
          ${nGreeting('Welcome back')}
          ${nP('The CSO has reinstated your SmartKey access. Set a new password to log back in.')}
          ${nBtn('Restore access', link)}
          ${nP('If you did not expect this email, you can safely ignore it.', 0)}
        `
        : `
          ${nEyebrow('Account invitation')}
          ${nGreeting('The CSO has invited you to SmartKey')}
          ${nP('Set a password to activate your account. This link expires in 24 hours.')}
          ${nBtn('Activate account', link)}
          ${nP('If you did not expect this email, you can safely ignore it.', 0)}
        `,
      {
        preheader: isReinvite
          ? 'The CSO has reinstated your SmartKey access. Set a new password to log back in.'
          : 'The CSO has invited you to SmartKey. Set a password to activate your account.',
      }
    ),
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
  send({
    from: `"SmartKey" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'Get your SmartKey collection code today',
    html: nWrap(
      `
        ${nEyebrow('Weekend access &middot; today')}
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
  send({
    from: `"SmartKey" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'Your weekend key request has been approved',
    html: nWrap(
      `
        ${nEyebrow('Weekend access')}
        ${nBadge('Approved', 'success')}
        ${nGreeting(`Request approved, ${fullName}`)}
        ${nP(`Your weekend access request for <strong>${roomName} (${keyCode})</strong> on <strong>${requestedFor}</strong> has been approved.`)}
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

export const sendWeekendDeclinedEmail = async ({
  to,
  fullName,
  note,
}: {
  to: string;
  fullName: string;
  note?: string;
}) =>
  send({
    from: `"SmartKey" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'Your weekend key request was not approved',
    // No preferenceNote here: this function also serves guest declines
    // (guests have no notification_preferences row and no settings page),
    // so a "turn this off in Settings" line would be inaccurate for them.
    html: nWrap(`
      ${nEyebrow('Weekend access')}
      ${nBadge('Not approved', 'error')}
      ${nGreeting(`Request not approved, ${fullName}`)}
      ${nP('Your weekend access request has not been approved.')}
      ${note ? `${nSmallLabel('Note from your authoriser')}${nNote(note)}` : ''}
      ${nP("Contact your faculty's Dean or the CSO if you believe this is an error.", 0)}
    `),
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
  send({
    from: `"SmartKey" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'Your weekend access request has been approved',
    html: nWrap(
      `
        ${nEyebrow('Weekend access &middot; external')}
        <div style="margin:0 0 10px;">${nGuestBadge()}${nInlineBadge('Approved', 'success')}</div>
        ${nGreeting(`Request approved, ${fullName}`)}
        ${nP(`Your weekend access request for <strong>${roomName} (${keyCode})</strong> on <strong>${requestedFor}</strong> has been approved.`)}
        ${nP('On the day, use the button below to generate your 6-digit collection code and present it alongside your ID at the security desk. The code is valid for 10 minutes once generated.')}
        ${nBtn('Get your collection code', link)}
        ${nP('Keep this link private. Anyone with it can view your request.', 0)}
      `,
      {
        preheader: `Your weekend access request for ${roomName} (${keyCode}) has been approved.`,
      }
    ),
  });

export const sendPasswordResetEmail = async ({
  to,
  link,
}: {
  to: string;
  link: string;
}) =>
  send({
    from: `"SmartKey" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'Reset your SmartKey password',
    html: nWrap(
      `
        ${nEyebrow('Password reset')}
        ${nGreeting('Reset your password')}
        ${nP('Use the button below to set a new password. This link expires in 30 minutes.')}
        ${nBtn('Reset password', link)}
        ${nP('If you did not request this, you can safely ignore this email.', 0)}
      `,
      {
        preheader:
          'Use this link to set a new password for your SmartKey account.',
      }
    ),
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

  return send({
    from: `"SmartKey" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'Your SmartKey collection code',
    html: nWrap(
      `
        ${nEyebrow('Collection code')}
        ${nGreeting(`Ready for pickup, ${fullName}`)}
        ${nP(`This code is for <strong>${roomName} (${keyCode})</strong>. Present it at the security desk to collect the key.`)}
        ${nCodePanel(code, `Expires at ${expiresAtLabel} - request a new one if it lapses`)}
      `,
      {
        preheader: `Your collection code for ${roomName} (${keyCode}) is ${code}.`,
      }
    ),
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

  return send({
    from: `"SmartKey" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'Your key is overdue for return',
    // No preferenceNote here: sent to both registered requesters and guests
    // (guests always receive it, with no preference row or settings page).
    html: nWrap(
      `
        ${nEyebrow('Key overdue')}
        ${nBadge('Action needed', 'error')}
        ${nGreeting(`Please return your key, ${fullName}`)}
        ${nP('This key was due back on the date below. Please return it to the security desk as soon as possible.')}
        ${nDetailPanel(nDetailRow('Key', `${roomName} (${keyCode})`) + nDetailRow('Due', deadlineLabel, true))}
        ${nP('This has been logged. Contact the CSO if you believe this is an error.', 0)}
      `,
      {
        preheader: `${roomName} (${keyCode}) is overdue for return.`,
      }
    ),
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
  send({
    from: `"SmartKey" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'New weekend access request awaiting your review',
    html: nWrap(
      `
        ${nEyebrow('Weekend request &middot; awaiting review')}
        ${nGreeting(`Dear ${fullName},`)}
        ${isGuest ? `<div style="margin:0 0 12px;">${nGuestBadge()}</div>` : ''}
        ${nP(`<strong>${requesterName}</strong> has requested <strong>${roomLabel}</strong> in ${unitName} for <strong>${requestedFor}</strong>.`)}
        ${
          decisionLink
            ? `
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
  const mismatchRows = [
    mismatches.signature !== undefined
      ? nMismatchRow('Signature', mismatches.signature)
      : null,
    mismatches.stamp !== undefined
      ? nMismatchRow('Stamp', mismatches.stamp)
      : null,
  ]
    .filter((row): row is string => row !== null)
    .join('');

  return send({
    from: `"SmartKey" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'Signature/stamp mismatch held for review',
    html: nWrap(
      `
        ${nEyebrow('Signature review')}
        ${nBadge('Held for review', 'warning')}
        ${nGreeting(`Approval held, ${fullName}`)}
        ${nP(`<strong>${requesterName}</strong>'s weekend approval for <strong>${roomName} (${keyCode})</strong> is on hold. The submitted signature and/or stamp did not match the Dean's reference within the ${thresholdPct}% threshold.`)}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;background:#FAFAFB;border:1px solid ${N.border};border-radius:10px;"><tr><td style="padding:6px 18px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;">
            ${mismatchRows}
          </table>
        </td></tr></table>
        ${nBtn('Review on the dashboard', link)}
      `,
      {
        preferenceNote: true,
        preheader: `A signature or stamp mismatch is holding ${requesterName}'s weekend approval for ${roomName} (${keyCode}).`,
      }
    ),
  });
};

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
  send({
    from: `"SmartKey" <${process.env.GMAIL_USER}>`,
    to,
    subject: "Your faculty's daily activity digest",
    html: nWrapDigest(
      `
        ${nGreeting(`Good morning, ${fullName}`)}
        ${nP(`Faculty activity for the last 24 hours &middot; ${formatDigestDate(new Date())}`, 18)}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;">
          ${nDigestRow('Keys issued', stats.issued_count)}
          ${nDigestRow('Keys returned', stats.returned_count)}
          ${nDigestRow('Keys currently overdue', stats.overdue_count, true)}
          ${nDigestRow('Weekend requests submitted', stats.weekend_submitted_count)}
          ${nDigestRow('Weekend requests awaiting your decision', stats.weekend_pending_count, true)}
        </table>
      `,
      {
        preferenceNote: true,
        preheader: "Your faculty's activity summary for the last 24 hours.",
      }
    ),
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
  send({
    from: `"SmartKey" <${process.env.GMAIL_USER}>`,
    to,
    subject: "SmartKey's daily activity digest",
    html: nWrapDigest(
      `
        ${nGreeting(`Good morning, ${fullName}`)}
        ${nP(`Building-wide activity for the last 24 hours &middot; ${formatDigestDate(new Date())}`, 18)}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;">
          ${nDigestRow('Keys issued', stats.issued_count)}
          ${nDigestRow('Keys returned', stats.returned_count)}
          ${nDigestRow('Keys currently overdue', stats.overdue_count, true)}
          ${nDigestRow('High-risk requests', stats.high_risk_count, true)}
          ${nDigestRow('Signature mismatches', stats.signature_mismatch_count, true)}
          ${nDigestRow('Incidents logged', stats.incidents_count, true)}
        </table>
      `,
      {
        preferenceNote: true,
        preheader:
          "SmartKey's building-wide activity summary for the last 24 hours.",
      }
    ),
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
  send({
    from: `"SmartKey" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'Your SmartKey weekend access request',
    html: nWrap(
      `
        ${nEyebrow('Weekend access &middot; external')}
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
