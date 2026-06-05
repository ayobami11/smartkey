'use client';

import { useRef, useState } from 'react';
import {
  CheckIcon,
  CheckCircleIcon,
  CloudUploadIcon,
  RefreshCwIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Step = 0 | 1 | 2 | 3;

const steps = [
  { label: 'Signature' },
  { label: 'Stamp' },
  { label: 'Confirm' },
] as const;

export default function HodOnboardingPage() {
  const [step, setStep] = useState<Step>(0);
  const [sigFile, setSigFile] = useState<File | null>(null);
  const [stampFile, setStampFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sigInputRef = useRef<HTMLInputElement>(null);
  const stampInputRef = useRef<HTMLInputElement>(null);

  const handleFinish = async () => {
    if (!sigFile || !stampFile) return;
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.append('password', password);
    formData.append('signature', sigFile);
    formData.append('stamp', stampFile);

    const res = await fetch('/api/auth/activate-hod', {
      method: 'POST',
      body: formData,
    });

    const json = (await res.json()) as { error?: string };

    if (!res.ok) {
      setError(json.error ?? 'Something went wrong. Please try again.');
      setSubmitting(false);
      return;
    }

    setStep(3);
  };

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
                upload the image. We&apos;ll use it to verify future approvals
                you sign.
              </p>
            </div>

            <input
              ref={sigInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label="Signature image file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setSigFile(file);
              }}
            />

            {!sigFile ? (
              <button
                type="button"
                onClick={() => sigInputRef.current?.click()}
                className="flex w-full flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border bg-muted/30 p-10 text-center transition-colors hover:border-primary/50 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <CloudUploadIcon
                  className="size-8 text-muted-foreground"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Click to browse
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    PNG or JPG · max 5 MB
                  </p>
                </div>
              </button>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex h-32 items-center justify-center overflow-hidden rounded-lg border border-border bg-white">
                  <img
                    src={URL.createObjectURL(sigFile)}
                    alt="Signature preview"
                    className="max-h-full max-w-full object-contain p-2"
                  />
                </div>
                <p className="text-sm text-muted-foreground">{sigFile.name}</p>
                <button
                  type="button"
                  onClick={() => {
                    setSigFile(null);
                    if (sigInputRef.current) sigInputRef.current.value = '';
                  }}
                  className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <RefreshCwIcon className="size-3.5" aria-hidden="true" />
                  Replace
                </button>
              </div>
            )}

            <div className="flex justify-end">
              <Button disabled={!sigFile} onClick={() => setStep(1)}>
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
                Stamp on white paper, scan or photograph, then upload.
              </p>
            </div>

            <input
              ref={stampInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label="Stamp image file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setStampFile(file);
              }}
            />

            {!stampFile ? (
              <button
                type="button"
                onClick={() => stampInputRef.current?.click()}
                className="flex w-full flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border bg-muted/30 p-10 text-center transition-colors hover:border-primary/50 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <CloudUploadIcon
                  className="size-8 text-muted-foreground"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Click to browse
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    PNG or JPG · max 5 MB
                  </p>
                </div>
              </button>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex h-32 items-center justify-center overflow-hidden rounded-lg border border-border bg-white">
                  <img
                    src={URL.createObjectURL(stampFile)}
                    alt="Stamp preview"
                    className="max-h-full max-w-full object-contain p-2"
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  {stampFile.name}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setStampFile(null);
                    if (stampInputRef.current) stampInputRef.current.value = '';
                  }}
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
              <Button disabled={!stampFile} onClick={() => setStep(2)}>
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Step 2 — Password + Confirm */}
        {step === 2 && (
          <div className="flex flex-col gap-6 rounded-lg border border-border bg-card p-6 shadow-[0_2px_4px_rgba(15,23,42,0.06)]">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Confirm and finish
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Set a password for your SmartKey account to complete setup.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Signature
                </p>
                {sigFile && (
                  <img
                    src={URL.createObjectURL(sigFile)}
                    alt="Signature reference"
                    className="h-24 w-full object-contain"
                  />
                )}
              </div>
              <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Departmental stamp
                </p>
                {stampFile && (
                  <img
                    src={URL.createObjectURL(stampFile)}
                    alt="Stamp reference"
                    className="h-24 w-full object-contain"
                  />
                )}
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  autoComplete="new-password"
                />
              </div>
            </div>

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

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-between">
              <Button
                variant="ghost"
                onClick={() => setStep(1)}
                disabled={submitting}
              >
                Back
              </Button>
              <Button
                disabled={
                  !confirmed ||
                  password.length < 8 ||
                  password !== confirmPassword ||
                  submitting
                }
                onClick={handleFinish}
              >
                {submitting ? 'Setting up…' : 'Finish setup'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
