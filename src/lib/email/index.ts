import { Resend } from 'resend';

const getResend = () => new Resend(process.env.RESEND_API_KEY ?? '');

const FROM = () => process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';

const header = `
  <div style="background:#7B1F2D;padding:20px 24px;border-radius:8px 8px 0 0;">
    <span style="color:#ffffff;font-size:20px;font-weight:600;letter-spacing:-0.3px;">SmartKey</span>
  </div>`;

const footer = `
  <p style="margin:24px 0 0;font-size:12px;color:#94A3B8;line-height:1.5;">
    University of Lagos Senate Building · Key Management System
  </p>`;

const wrap = (body: string) => `
  <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 16px;">
    ${header}
    <div style="background:#ffffff;border:1px solid #E2E8F0;border-top:none;padding:32px 24px;border-radius:0 0 8px 8px;">
      ${body}
      ${footer}
    </div>
  </div>`;

const button = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block;background:#7B1F2D;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:500;">${label}</a>`;

const ROLE_LABEL: Record<string, string> = {
  HOD: 'Head of Department',
  VERIFIER: 'Security Verifier',
  REQUESTER: 'Staff',
};

export const sendInviteEmail = async ({
  to,
  fullName,
  role,
  activationLink,
}: {
  to: string;
  fullName: string;
  role: string;
  activationLink: string;
}) =>
  getResend().emails.send({
    from: FROM(),
    to,
    subject: "You've been invited to SmartKey",
    html: wrap(`
      <p style="margin:0 0 8px;font-size:16px;color:#0F172A;font-weight:500;">Hello, ${fullName}</p>
      <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6;">
        You have been provisioned as a <strong>${ROLE_LABEL[role] ?? role}</strong> on the SmartKey
        key management system for the University of Lagos Senate Building.
      </p>
      ${button(activationLink, 'Activate your account')}
      <p style="margin:24px 0 0;font-size:12px;color:#94A3B8;line-height:1.5;">
        This link expires in 24&nbsp;hours. If you did not expect this invitation, you can safely ignore this email.
      </p>`),
  });

export const sendPasswordResetEmail = async ({
  to,
  resetLink,
}: {
  to: string;
  resetLink: string;
}) =>
  getResend().emails.send({
    from: FROM(),
    to,
    subject: 'Reset your SmartKey password',
    html: wrap(`
      <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6;">
        We received a request to reset your SmartKey password.
        Click the button below to choose a new password.
      </p>
      ${button(resetLink, 'Reset password')}
      <p style="margin:24px 0 0;font-size:12px;color:#94A3B8;line-height:1.5;">
        This link expires in 1&nbsp;hour. If you did not request a password reset, you can safely ignore this email.
      </p>`),
  });
