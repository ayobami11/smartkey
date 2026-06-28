'use client';

import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangleIcon, CheckCircleIcon } from 'lucide-react';

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
import { apiFetch } from '@/lib/api';
import {
  incidentFormSchema,
  type IncidentFormInput,
} from '@/lib/validation/schemas';

// Types

type FormStep = 'form' | 'submitting' | 'success';

const INCIDENT_TYPE_DETAILS: {
  value: IncidentFormInput['type'];
  label: string;
  hint: string;
}[] = [
  {
    value: 'MISSING_KEY',
    label: 'Missing key',
    hint: 'A key is unaccounted for',
  },
  {
    value: 'SUSPICIOUS_ACTIVITY',
    label: 'Suspicious activity',
    hint: 'Unauthorized access or unusual behaviour',
  },
  {
    value: 'EQUIPMENT_FAULT',
    label: 'Equipment fault',
    hint: 'Security equipment is malfunctioning',
  },
  {
    value: 'PROCEDURAL',
    label: 'Procedural',
    hint: 'A protocol was not followed correctly',
  },
  {
    value: 'OTHER',
    label: 'Other',
    hint: 'Any other security concern',
  },
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

  const watchedSeverity = useWatch({ control: form.control, name: 'severity' });

  const onSubmit = form.handleSubmit(async (values) => {
    setStep('submitting');
    setSubmitError(null);
    const result = await apiFetch<{ reference: string }>('/api/incidents', {
      method: 'POST',
      body: { ...values, occurred_at: new Date().toISOString() },
    });
    if (result.error) {
      setSubmitError(result.error);
      setStep('form');
      return;
    }
    setIncidentRef(result.data?.reference ?? null);
    setStep('success');
  });

  const handleReset = () => {
    form.reset();
    setSubmitError(null);
    setIncidentRef(null);
    setStep('form');
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Incidents</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Log an incident that occurred during your shift.
        </p>
      </div>

      <div className="mx-auto w-full max-w-lg">
        {/* Success state */}
        {step === 'success' && (
          <div className="overflow-hidden rounded-lg border border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/60 dark:bg-emerald-950/30">
            <div className="border-b border-emerald-200 bg-emerald-100/60 px-5 py-2.5 dark:border-emerald-900/60 dark:bg-emerald-900/20">
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                Incident logged
              </p>
            </div>
            <div className="flex flex-col items-center gap-5 p-8 text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                <CheckCircleIcon
                  className="size-7 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
              </div>
              <div>
                {incidentRef && (
                  <p className="font-mono text-xs font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                    {incidentRef}
                  </p>
                )}
                <p className="mt-1.5 text-lg font-semibold text-foreground">
                  Incident recorded
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {watchedSeverity === 'HIGH'
                    ? 'The CSO has been notified immediately.'
                    : 'The incident has been appended to the audit log.'}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleReset}>
                Log another incident
              </Button>
            </div>
          </div>
        )}

        {/* Form */}
        {step !== 'success' && (
          <form
            onSubmit={onSubmit}
            className="overflow-hidden rounded-lg border border-border bg-card shadow-[0_2px_4px_rgba(15,23,42,0.06)]"
            aria-label="Log incident form"
          >
            <div className="border-b border-border bg-muted/50 px-5 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                New incident report
              </p>
            </div>
            <div className="flex flex-col gap-6 p-6">
              {/* Type */}
              <Controller
                name="type"
                control={form.control}
                render={({ field, fieldState }) => {
                  const selectedType = INCIDENT_TYPE_DETAILS.find(
                    (t) => t.value === field.value
                  );
                  return (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="incident-type">
                        Incident type
                      </FieldLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={step === 'submitting'}
                      >
                        <SelectTrigger
                          id="incident-type"
                          aria-invalid={fieldState.invalid}
                        >
                          {selectedType ? (
                            <span className="flex items-center gap-1.5 overflow-hidden">
                              <span className="shrink-0 font-medium">
                                {selectedType.label}
                              </span>
                              <span className="shrink-0 text-muted-foreground">
                                ·
                              </span>
                              <span className="truncate text-muted-foreground">
                                {selectedType.hint}
                              </span>
                            </span>
                          ) : (
                            <SelectValue placeholder="Select a type" />
                          )}
                        </SelectTrigger>
                        <SelectContent position="popper">
                          {INCIDENT_TYPE_DETAILS.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              <div className="flex flex-col gap-0.5">
                                <span className="text-sm font-medium">
                                  {t.label}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {t.hint}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  );
                }}
              />

              {/* Severity */}
              <Controller
                name="severity"
                control={form.control}
                render={({ field, fieldState }) => {
                  const selectedSeverity = SEVERITIES.find(
                    (s) => s.value === field.value
                  );
                  return (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="incident-severity">
                        Severity
                      </FieldLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={step === 'submitting'}
                      >
                        <SelectTrigger
                          id="incident-severity"
                          aria-invalid={fieldState.invalid}
                        >
                          {selectedSeverity ? (
                            <span className="flex items-center gap-1.5 overflow-hidden">
                              <span className="shrink-0 font-medium">
                                {selectedSeverity.label}
                              </span>
                              <span className="shrink-0 text-muted-foreground">
                                ·
                              </span>
                              <span className="truncate text-muted-foreground">
                                {selectedSeverity.hint}
                              </span>
                            </span>
                          ) : (
                            <SelectValue placeholder="Select a severity level" />
                          )}
                        </SelectTrigger>
                        <SelectContent position="popper">
                          {SEVERITIES.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                              <div className="flex flex-col gap-0.5">
                                <span className="text-sm font-medium">
                                  {s.label}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {s.hint}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  );
                }}
              />

              {/* High-severity banner */}
              {watchedSeverity === 'HIGH' && (
                <div
                  className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/5 p-3.5"
                  role="alert"
                >
                  <AlertTriangleIcon
                    className="mt-0.5 size-4 shrink-0 text-destructive"
                    aria-hidden="true"
                  />
                  <p className="text-xs text-destructive">
                    High severity incidents alert the CSO immediately and
                    trigger a formal incident summary.
                  </p>
                </div>
              )}

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
                      placeholder="Describe what happened, who was involved, and any actions already taken."
                      rows={6}
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
                {step === 'submitting' ? 'Logging incident...' : 'Log incident'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
