import { setDefaultResultOrder } from 'node:dns';

import nodemailer from 'nodemailer';

setDefaultResultOrder('ipv4first');

export const transporter = nodemailer.createTransport({
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
