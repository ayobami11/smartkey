'use client';

import { useState } from 'react';
import {
  CheckIcon,
  CheckCircleIcon,
  CloudUploadIcon,
  ImageIcon,
  RefreshCwIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';

type Step = 0 | 1 | 2 | 3;

const steps = [
  { label: 'Signature' },
  { label: 'Stamp' },
  { label: 'Confirm' },
] as const;

export default function HodOnboardingPage() {
  const [step, setStep] = useState<Step>(0);
  const [sigUploaded, setSigUploaded] = useState(false);
  const [stampUploaded, setStampUploaded] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

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
            <a href="/hod">Continue to dashboard</a>
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
                      className={`mx-2 mt-[-18px] h-px flex-1 ${step > idx ? 'bg-primary' : 'bg-border'}`}
                      aria-hidden="true"
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        {/* Step 0 — Signature */}
        {step === 0 && (
          <div className="flex flex-col gap-6 rounded-lg border border-border bg-card p-6 shadow-[0_2px_4px_rgba(15,23,42,0.06)]">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Upload your signature
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Sign on a clean white sheet of paper, scan or photograph it, and
                upload the image. We&apos;ll process it to compare against
                future approvals you sign.
              </p>
            </div>

            {!sigUploaded ? (
              <div>
                <button
                  type="button"
                  onClick={() => setSigUploaded(true)}
                  className="flex w-full flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border bg-muted/30 p-10 text-center transition-colors hover:border-primary/50 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  aria-label="Upload signature image"
                >
                  <CloudUploadIcon
                    className="size-8 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Drag and drop or click to browse
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      PNG or JPG · max 5 MB
                    </p>
                  </div>
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Original
                    </p>
                    <div className="flex h-32 items-center justify-center rounded-lg border border-border bg-white">
                      <ImageIcon
                        className="size-8 text-muted-foreground/40"
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Processed reference
                    </p>
                    <div className="flex h-32 items-center justify-center rounded-lg border border-border bg-muted/60">
                      <ImageIcon
                        className="size-8 text-muted-foreground/40"
                        aria-hidden="true"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      This is what we&apos;ll compare future signatures against.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSigUploaded(false)}
                  className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <RefreshCwIcon className="size-3.5" aria-hidden="true" />
                  Replace
                </button>
              </div>
            )}

            <div className="flex justify-end">
              <Button disabled={!sigUploaded} onClick={() => setStep(1)}>
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Step 1 — Stamp */}
        {step === 1 && (
          <div className="flex flex-col gap-6 rounded-lg border border-border bg-card p-6 shadow-[0_2px_4px_rgba(15,23,42,0.06)]">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Upload your departmental stamp
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Stamp on white paper, scan or photograph, upload.
              </p>
            </div>

            {!stampUploaded ? (
              <button
                type="button"
                onClick={() => setStampUploaded(true)}
                className="flex w-full flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border bg-muted/30 p-10 text-center transition-colors hover:border-primary/50 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                aria-label="Upload stamp image"
              >
                <CloudUploadIcon
                  className="size-8 text-muted-foreground"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Drag and drop or click to browse
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    PNG or JPG · max 5 MB
                  </p>
                </div>
              </button>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Original
                    </p>
                    <div className="flex h-32 items-center justify-center rounded-lg border border-border bg-white">
                      <ImageIcon
                        className="size-8 text-muted-foreground/40"
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Processed reference
                    </p>
                    <div className="flex h-32 items-center justify-center rounded-lg border border-border bg-muted/60">
                      <ImageIcon
                        className="size-8 text-muted-foreground/40"
                        aria-hidden="true"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      This is what we&apos;ll compare future stamps against.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setStampUploaded(false)}
                  className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <RefreshCwIcon className="size-3.5" aria-hidden="true" />
                  Replace
                </button>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button disabled={!stampUploaded} onClick={() => setStep(2)}>
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Step 2 — Confirm */}
        {step === 2 && (
          <div className="flex flex-col gap-6 rounded-lg border border-border bg-card p-6 shadow-[0_2px_4px_rgba(15,23,42,0.06)]">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Confirm and finish
              </h2>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Signature
                </p>
                <div className="flex h-24 items-center justify-center rounded-md bg-muted/60">
                  <ImageIcon
                    className="size-7 text-muted-foreground/40"
                    aria-hidden="true"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Processed reference
                </p>
              </div>
              <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Departmental stamp
                </p>
                <div className="flex h-24 items-center justify-center rounded-md bg-muted/60">
                  <ImageIcon
                    className="size-7 text-muted-foreground/40"
                    aria-hidden="true"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Processed reference
                </p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              These references will be used to verify your future weekend
              approvals. You can update them later from your profile.
            </p>

            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 size-4 accent-primary"
              />
              <span className="text-sm text-foreground">
                I confirm these are my signature and departmental stamp.
              </span>
            </label>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button disabled={!confirmed} onClick={() => setStep(3)}>
                Finish setup
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
