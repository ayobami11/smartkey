import Link from 'next/link';

import { KeyRoundIcon, MailIcon } from 'lucide-react';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
        no self-registration. If you need access, contact your faculty&apos;s
        Dean or the CSO directly.
      </>
    ),
  },
  {
    id: 'code',
    question: "I didn't receive my verification code",
    answer: (
      <>
        Check your spam or junk folder. Codes expire a short time after
        generation - the code screen shows exactly how long you have left.
        Return to the sign-in page and try again to request a fresh code if it
        has expired. If the problem persists, contact the CSO.
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
];

const requesterGuide = [
  {
    id: 'requester-weekday',
    question: 'How do I request a key?',
    answer: (
      <>
        Sign in, then tap one of the keys on your dashboard to open the request
        sheet. Confirm the return time and submit - you&apos;ll receive a
        6-digit code by email, valid for 10 minutes, to present at the security
        desk.
      </>
    ),
  },
  {
    id: 'requester-weekend',
    question: 'How do I request weekend access?',
    answer: (
      <>
        Use the &ldquo;Request weekend access&rdquo; button on your dashboard.
        Your faculty&apos;s Dean reviews and approves or declines the request;
        you&apos;ll be notified by email either way. Once approved, return to
        your dashboard on the requested day to generate your collection code -
        codes are never issued in advance.
      </>
    ),
  },
  {
    id: 'requester-return',
    question: 'How do I return a key?',
    answer: (
      <>
        From your dashboard, generate a return code for the key you&apos;re
        holding and read it to the verifier at the desk. If you can&apos;t
        produce the code, the verifier can still record the return with a reason
        - this is logged as unverified and flagged for review.
      </>
    ),
  },
];

const deanGuide = [
  {
    id: 'dean-onboarding',
    question: 'Why am I asked to upload a signature and stamp?',
    answer: (
      <>
        On your first sign-in, you&apos;ll be asked to upload a reference
        signature and departmental stamp. These are compared automatically
        against future weekend-approval submissions to catch tampering, so this
        step must be completed before you can approve any requests.
      </>
    ),
  },
  {
    id: 'dean-collectors',
    question: 'How do I authorise a collector for a key?',
    answer: (
      <>
        Open the key from your dashboard&apos;s key grid, then choose an empty
        slot to search for and add a staff member. Each key allows up to three
        authorised collectors at a time.
      </>
    ),
  },
  {
    id: 'dean-weekend',
    question: 'How do I review a weekend access request?',
    answer: (
      <>
        Pending requests appear on your dashboard. Open one to see the
        requester, the requested date, and any uploaded authorisation letter,
        then approve or decline with an optional note. A mismatched signature or
        stamp holds the approval automatically and notifies the CSO for review.
      </>
    ),
  },
];

const verifierGuide = [
  {
    id: 'verifier-issue',
    question: 'How do I issue a key?',
    answer: (
      <>
        Enter the 6-digit code the collector gives you. Confirm their identity
        against the photo shown, check the risk tier badge, and tap Issue. A
        high-risk request requires you to acknowledge the listed risk factors
        before you can proceed - this can never be skipped.
      </>
    ),
  },
  {
    id: 'verifier-return',
    question: 'How do I receive a returned key?',
    answer: (
      <>
        Select the key from your outstanding-keys list and confirm the return
        code the collector reads out. If they don&apos;t have the code, you can
        still record the return with a reason - this is logged separately as
        unverified.
      </>
    ),
  },
  {
    id: 'verifier-handover',
    question: 'What happens at shift handover?',
    answer: (
      <>
        Your dashboard is locked behind the handover screen at the start of
        every shift. You must acknowledge every key still outstanding from the
        previous shift - individually or in bulk with an explicit confirmation -
        before the dashboard unlocks.
      </>
    ),
  },
];

const csoGuide = [
  {
    id: 'cso-provision',
    question: 'How do I create a new account?',
    answer: (
      <>
        From Users, provide a name, official email, and role. An activation link
        is emailed automatically and expires after 24 hours if unused - you can
        resend it from the same page.
      </>
    ),
  },
  {
    id: 'cso-alerts',
    question: 'Where do risk and signature-mismatch alerts show up?',
    answer: (
      <>
        Both appear on your dashboard in real time as they occur. A signature or
        stamp mismatch holds the Dean&apos;s approval until you review the
        reference and submitted images side by side and resolve it.
      </>
    ),
  },
  {
    id: 'cso-reports',
    question: 'How do I generate a shift report?',
    answer: (
      <>
        Open Reports and generate one for a completed shift. It&apos;s built
        automatically from that shift&apos;s event log - you can add comments,
        but the report itself can&apos;t be edited once created.
      </>
    ),
  },
  {
    id: 'cso-audit',
    question: 'How do I search the audit log?',
    answer: (
      <>
        Open Audit and filter by event type, zone, date range, or user. Every
        entry is permanent - nothing in the log can be edited or deleted, by
        anyone.
      </>
    ),
  },
];

const roleGuides = [
  { id: 'requester', label: 'Requester', items: requesterGuide },
  { id: 'verifier', label: 'Verifier', items: verifierGuide },
  { id: 'dean', label: 'Dean', items: deanGuide },
  { id: 'cso', label: 'CSO', items: csoGuide },
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
              Frequently Asked Questions (FAQs)
            </h2>
            <Accordion type="multiple" className="mt-4">
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

          <section aria-labelledby="role-faqs-heading">
            <h2
              id="role-faqs-heading"
              className="text-lg font-semibold text-foreground"
            >
              Role-based FAQs
            </h2>
            <Tabs defaultValue={roleGuides[0].id} className="mt-4 gap-4">
              <TabsList
                variant="line"
                aria-label="Choose your role"
                className="w-full justify-start border-b border-border"
              >
                {roleGuides.map(({ id, label }) => (
                  <TabsTrigger key={id} value={id}>
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {roleGuides.map(({ id, items }) => (
                <TabsContent key={id} value={id}>
                  <Accordion type="multiple">
                    {items.map(({ id: itemId, question, answer }) => (
                      <AccordionItem key={itemId} value={itemId}>
                        <AccordionTrigger>{question}</AccordionTrigger>
                        <AccordionContent>
                          <p className="text-muted-foreground">{answer}</p>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </TabsContent>
              ))}
            </Tabs>
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
