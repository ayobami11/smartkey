'use client';

import { useState } from 'react';
import { CheckIcon, CheckCircleIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { OnboardingForm } from '@/app/dean/onboarding/_components/onboarding-form';
import { SignatureUploadStep } from '@/app/dean/onboarding/_components/signature-upload-step';
import { StampUploadStep } from '@/app/dean/onboarding/_components/stamp-upload-step';

type Step = 0 | 1 | 2 | 3;

const steps = [
  { label: 'Signature' },
  { label: 'Stamp' },
  { label: 'Confirm' },
] as const;

export const OnboardingView = () => {
  const [step, setStep] = useState<Step>(0);
  const [sigFile, setSigFile] = useState<File | null>(null);
  const [stampFile, setStampFile] = useState<File | null>(null);

  if (step === 3) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-lg border border-border bg-card p-8 text-center shadow-[0_2px_4px_rgba(15,23,42,0.06)]">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircleIcon
              className="size-7 text-emerald-700"
              aria-hidden="true"
            />
          </div>
          <h2 className="text-lg font-semibold text-foreground">
            Setup complete.
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {"You're ready to use SmartKey."}
          </p>
          <Button asChild className="mt-6">
            <a href="/dean">Continue to dashboard</a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center p-4">
      <div className="w-full max-w-2xl">
        {/* Stepper */}
        <nav aria-label="Setup progress" className="mb-8">
          <ol className="flex items-center gap-0">
            {steps.map((s, idx) => {
              const done = step > idx;
              const active = step === idx;
              return (
                <li key={s.label} className="flex flex-1 items-center">
                  <div className="flex flex-col items-center gap-1.5">
                    <div
                      className={`flex size-8 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors ${
                        done
                          ? 'border-primary bg-primary text-primary-foreground'
                          : active
                            ? 'border-primary bg-background text-primary'
                            : 'border-border bg-background text-muted-foreground'
                      }`}
                      aria-current={active ? 'step' : undefined}
                    >
                      {done ? (
                        <CheckIcon className="size-4" aria-hidden="true" />
                      ) : (
                        idx + 1
                      )}
                    </div>
                    <span
                      className={`text-xs font-medium ${active ? 'text-foreground' : 'text-muted-foreground'}`}
                    >
                      {s.label}
                    </span>
                  </div>
                  {idx < steps.length - 1 && (
                    <div
                      className={`mx-2 -mt-4.5 h-px flex-1 ${step > idx ? 'bg-primary' : 'bg-border'}`}
                      aria-hidden="true"
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        {step === 0 && (
          <SignatureUploadStep
            initialFile={sigFile ?? undefined}
            onNext={(f) => {
              setSigFile(f);
              setStep(1);
            }}
          />
        )}

        {step === 1 && (
          <StampUploadStep
            initialFile={stampFile ?? undefined}
            onNext={(f) => {
              setStampFile(f);
              setStep(2);
            }}
            onBack={() => setStep(0)}
          />
        )}

        {step === 2 && (
          <OnboardingForm
            sigFile={sigFile!}
            stampFile={stampFile!}
            onSuccess={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        )}
      </div>
    </div>
  );
};
