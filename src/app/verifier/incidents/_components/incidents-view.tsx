'use client';

import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircleIcon, SirenIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  incidentFormSchema,
  type IncidentFormInput,
} from '@/lib/validation/schemas';

// Types

type FormStep = 'form' | 'submitting' | 'success';

// Constants

const INCIDENT_TYPES: { value: IncidentFormInput['type']; label: string }[] = [
  { value: 'MISSING_KEY', label: 'Missing key' },
  { value: 'SUSPICIOUS_ACTIVITY', label: 'Suspicious activity' },
  { value: 'EQUIPMENT_FAULT', label: 'Equipment fault' },
  { value: 'PROCEDURAL', label: 'Procedural issue' },
  { value: 'OTHER', label: 'Other' },
];

const SEVERITIES: {
  value: IncidentFormInput['severity'];
  label: string;
  hint: string;
}[] = [
  { value: 'LOW', label: 'Low', hint: 'Minor issue, no immediate risk' },
  {
    value: 'MEDIUM',
    label: 'Medium',
    hint: 'Requires follow-up before end of shift',
  },
  {
    value: 'HIGH',
    label: 'High',
    hint: 'Requires immediate CSO attention',
  },
];

// Component

export const IncidentsView = () => {
  const [step, setStep] = useState<FormStep>('form');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [incidentRef, setIncidentRef] = useState<string | null>(null);

  const form = useForm<IncidentFormInput>({
    resolver: zodResolver(incidentFormSchema),
    defaultValues: { type: undefined, severity: undefined, description: '' },
  });

  const watchedSeverity = form.watch('severity');

  const onSubmit = form.handleSubmit(async (values) => {
    setStep('submitting');
    setSubmitError(null);
    try {
      const res = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...values,
          occurred_at: new Date().toISOString(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(
          (json as { error?: string }).error ??
            'Failed to log incident. Please try again.'
        );
        setStep('form');
        return;
      }
      const ref = (json as { data?: { reference?: string } }).data?.reference;
      setIncidentRef(ref ?? null);
      setStep('success');
    } catch {
      setSubmitError('Network error. Check your connection and try again.');
      setStep('form');
    }
  });

  const handleReset = () => {
    form.reset();
    setSubmitError(null);
    setIncidentRef(null);
    setStep('form');
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      <div className="flex items-center gap-3">
        <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
          <SirenIcon
            className="size-4 text-muted-foreground"
            aria-hidden="true"
          />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-foreground">Incidents</h1>
          <p className="text-xs text-muted-foreground">
            Log an incident that occurred during your shift.
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-lg">
        {/* Success state */}
        {step === 'success' && (
          <div className="flex flex-col items-center gap-4 rounded-lg border border-emerald-200 bg-emerald-50 p-8 text-center dark:border-emerald-900 dark:bg-emerald-950/30">
            <CheckCircleIcon
              className="size-10 text-emerald-600"
              aria-hidden="true"
            />
            <div>
              <p className="font-medium text-foreground">Incident logged</p>
              {incidentRef && (
                <p className="mt-1 font-mono text-sm text-muted-foreground">
                  Reference: {incidentRef}
                </p>
              )}
              <p className="mt-1 text-sm text-muted-foreground">
                {watchedSeverity === 'HIGH'
                  ? 'The CSO has been notified.'
                  : 'The incident has been recorded in the audit log.'}
              </p>
            </div>
            <Button variant="outline" onClick={handleReset}>
              Log another incident
            </Button>
          </div>
        )}

        {/* Form */}
        {step !== 'success' && (
          <form
            onSubmit={onSubmit}
            className="flex flex-col gap-6 rounded-lg border border-border bg-card p-6 shadow-[0_2px_4px_rgba(15,23,42,0.06)]"
            aria-label="Log incident form"
          >
            {/* Type */}
            <Controller
              name="type"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="incident-type">Incident type</FieldLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={step === 'submitting'}
                  >
                    <SelectTrigger
                      id="incident-type"
                      aria-invalid={fieldState.invalid}
                    >
                      <SelectValue placeholder="Select type…" />
                    </SelectTrigger>
                    <SelectContent>
                      {INCIDENT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            {/* Severity */}
            <Controller
              name="severity"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="incident-severity">Severity</FieldLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={step === 'submitting'}
                  >
                    <SelectTrigger
                      id="incident-severity"
                      aria-invalid={fieldState.invalid}
                    >
                      <SelectValue placeholder="Select severity…" />
                    </SelectTrigger>
                    <SelectContent>
                      {SEVERITIES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          <span>{s.label}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            — {s.hint}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                  {watchedSeverity === 'HIGH' && (
                    <p className="text-xs text-destructive">
                      High severity incidents notify the CSO immediately.
                    </p>
                  )}
                </Field>
              )}
            />

            {/* Description */}
            <Controller
              name="description"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="incident-description">
                    Description
                  </FieldLabel>
                  <Textarea
                    id="incident-description"
                    placeholder="Describe what happened, who was involved, and any actions already taken…"
                    rows={5}
                    className="resize-none"
                    disabled={step === 'submitting'}
                    aria-invalid={fieldState.invalid}
                    aria-describedby="description-hint"
                    {...field}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                  <p
                    id="description-hint"
                    className="text-xs text-muted-foreground"
                  >
                    Be specific. This entry is immutable once submitted.
                  </p>
                </Field>
              )}
            />

            {submitError && (
              <p className="text-xs text-destructive" role="alert">
                {submitError}
              </p>
            )}

            <Button
              type="submit"
              disabled={step === 'submitting'}
              aria-busy={step === 'submitting'}
              className="w-full"
            >
              {step === 'submitting' ? 'Logging incident…' : 'Log incident'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
};
