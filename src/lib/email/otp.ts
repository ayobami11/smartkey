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
        <div style="background:#7B1F2D;padding:16px 24px;border-radius:8px 8px 0 0;">
          <span style="color:#fff;font-size:18px;font-weight:600;">SmartKey</span>
        </div>
        <div style="background:#fff;border:1px solid #E2E8F0;border-top:none;padding:32px 24px;border-radius:0 0 8px 8px;">
          <p style="margin:0 0 16px;color:#475569;font-size:14px;">Your sign-in verification code:</p>
          <div style="letter-spacing:10px;font-size:40px;font-family:monospace;font-weight:700;color:#0F172A;margin-bottom:16px;">${code}</div>
          <p style="margin:0;color:#94A3B8;font-size:12px;">Expires in 10&nbsp;minutes. Do not share this code.</p>
        </div>
      </div>
    `,
  });
