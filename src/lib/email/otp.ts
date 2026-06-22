import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
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

// Morning-of reminder for an approved weekend request. No code is emailed for
// the weekend flow — the requester (or guest) mints a short-lived collection
// code from the linked page on the requested day. This nudge closes the gap
// where an approved request would otherwise be forgotten until the day passed.
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

// Status-link email for an external (non-registered) weekend key request.
// The link carries the unguessable access_token so the guest can track their
// request, mint a collection code on the day, and present it at the desk.
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
            Your weekend access request has been submitted and is awaiting Head of
            Department approval. Use the link below to track its status and, once
            approved, to get your collection code on the day.
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
