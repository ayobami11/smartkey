import Link from 'next/link';

import { KeyRoundIcon, MailIcon } from 'lucide-react';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Help',
  description:
    'Get help with SmartKey accounts, verification codes, and key requests.',
};

const faqs = [
  {
    id: 'account',
    question: 'How do I get an account?',
    answer: (
      <>
        Accounts are provisioned by the Chief Security Officer (CSO). There is
        no self-registration. If you need access, contact your department&apos;s
        Head of Department or the CSO directly.
      </>
    ),
  },
  {
    id: 'code',
    question: "I didn't receive my verification code",
    answer: (
      <>
        Check your spam or junk folder. Codes expire after 10 minutes — return
        to the sign-in page and try again to request a fresh code. If the
        problem persists, contact the CSO.
      </>
    ),
  },
  {
    id: 'password',
    question: 'I forgot my password',
    answer: (
      <>
        Use the <Link href="/forgot-password">Forgot password</Link> link on the
        sign-in page. A reset link will be sent to your registered email
        address.
      </>
    ),
  },
  {
    id: 'request',
    question: 'How do I request a key?',
    answer: (
      <>
        Sign in with your account, then tap the key you want to request from
        your dashboard. You&apos;ll receive a 6-digit code by email to present
        at the security desk.
      </>
    ),
  },
];

export default function HelpPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <KeyRoundIcon className="size-5 text-primary" aria-hidden="true" />
            <span className="font-display text-xl font-semibold text-primary">
              SmartKey
            </span>
          </Link>
          <Button asChild size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Help &amp; Support
        </h1>
        <p className="mt-3 text-muted-foreground">
          SmartKey is the digital key management system for the University of
          Lagos Senate Building.
        </p>

        <div className="mt-10 space-y-10">
          <section aria-labelledby="faq-heading">
            <h2
              id="faq-heading"
              className="text-lg font-semibold text-foreground"
            >
              Frequently asked questions
            </h2>
            <Accordion type="multiple" className="mt-4 border rounded-lg px-2">
              {faqs.map(({ id, question, answer }) => (
                <AccordionItem key={id} value={id}>
                  <AccordionTrigger>{question}</AccordionTrigger>
                  <AccordionContent>
                    <p className="text-muted-foreground">{answer}</p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>

          <section aria-labelledby="contact-heading">
            <h2
              id="contact-heading"
              className="text-lg font-semibold text-foreground"
            >
              Contact support
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              For account issues, access problems, or technical errors, contact
              the Chief Security Officer at the Senate Building security desk.
            </p>
            <a
              href="mailto:cso@unilag.edu.ng"
              className="mt-3 inline-flex items-center gap-2 text-sm text-primary underline-offset-4 hover:underline"
            >
              <MailIcon className="size-4" aria-hidden="true" />
              cso@unilag.edu.ng
            </a>
          </section>
        </div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
          <p className="text-xs text-muted-foreground">
            © 2026 University of Lagos · SmartKey
          </p>
        </div>
      </footer>
    </div>
  );
}
