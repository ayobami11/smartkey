import type { HtmlFragment } from '@/lib/email/html';

// What a template produces. The recipient is added by whoever sends it.
export type EmailContent = { subject: string; html: HtmlFragment };

export type EmailMessage = EmailContent & { to: string };

// The seam between "what to send" and "how it leaves the building". Two
// adapters: Gmail SMTP in production, an in-memory outbox in tests.
export type Transport = { send: (message: EmailMessage) => Promise<void> };

export const siteUrl = () =>
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://smartkey-ochre.vercel.app';

// Loaded lazily so that importing this module (as the notifications module
// and its tests do) never pulls in nodemailer, sharp, or 'server-only'.
let gmail: Promise<Transport> | null = null;

const loadGmail = async (): Promise<Transport> => {
  const [
    { setDefaultResultOrder },
    { default: nodemailer },
    { getLogoAttachment },
  ] = await Promise.all([
    import('node:dns'),
    import('nodemailer'),
    import('@/lib/email/logo'),
  ]);

  setDefaultResultOrder('ipv4first');

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
    // Without these, a blocked or filtered port 587 hangs on the OS TCP
    // timeout (~20s observed locally), which overruns the serverless function
    // budget on Vercel and makes login appear to freeze rather than fail.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    dnsTimeout: 5_000,
  });

  return {
    send: async ({ to, subject, html }) => {
      // Every template renders the embedded logo in its header, so every
      // send attaches it here rather than at each call site.
      await transporter.sendMail({
        from: `"SmartKey" <${process.env.GMAIL_USER}>`,
        to,
        subject,
        html: html.toString(),
        attachments: [await getLogoAttachment()],
      });
    },
  };
};

export const gmailTransport: Transport = {
  send: async (message) => {
    gmail ??= loadGmail();
    await (await gmail).send(message);
  },
};

export const createOutbox = () => {
  const sent: EmailMessage[] = [];
  const transport: Transport = {
    send: async (message) => {
      sent.push(message);
    },
  };
  return { transport, sent };
};
