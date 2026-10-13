import {
  markup,
  nBtn,
  nCodePanel,
  nEyebrow,
  nGreeting,
  nP,
  nWrap,
} from '@/lib/email/html';
import type { EmailContent } from '@/lib/email/transport';

// Account emails: sent to a known address, not about a request, so they are
// sent directly by the auth routes rather than through notifications.
//
// tests/e2e/utils/otp.ts reads the OTP email over IMAP — keep its content
// stable.

export const otpEmail = ({ code }: { code: string }): EmailContent => ({
  subject: 'Your SmartKey verification code',
  html: nWrap(
    markup`
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

export const activationEmail = ({
  link,
  isReinvite = false,
}: {
  link: string;
  isReinvite?: boolean;
}): EmailContent => ({
  subject: isReinvite
    ? 'Your SmartKey access has been restored'
    : 'Activate your SmartKey account',
  html: nWrap(
    isReinvite
      ? markup`
          ${nEyebrow('Access restored')}
          ${nGreeting('Welcome back')}
          ${nP('The CSO has reinstated your SmartKey access. Set a new password to log back in.')}
          ${nBtn('Restore access', link)}
          ${nP('If you did not expect this email, you can safely ignore it.', 0)}
        `
      : markup`
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

export const passwordResetEmail = ({
  link,
}: {
  link: string;
}): EmailContent => ({
  subject: 'Reset your SmartKey password',
  html: nWrap(
    markup`
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
