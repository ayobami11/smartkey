'use client';

import { useEffect, useState } from 'react';

import { AlertCircleIcon, CheckCircleIcon } from 'lucide-react';

import { apiFetch } from '@/lib/api';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';

// Unchanged from the original mockup — local-only, no persistence, no
// onChange handler. Only "Daily digest" below is real; these three are a
// separate, still-open audit (see docs/REVIEW_ACTIONS_BACKEND.md).
const mockNotificationToggles = [
  { id: 'anomaly_inapp', label: 'Anomaly alerts (in-app)', enabled: true },
  { id: 'anomaly_email', label: 'Anomaly alerts (email)', enabled: true },
  {
    id: 'signature_email',
    label: 'Signature mismatches (email)',
    enabled: true,
  },
];

type LoadState = 'loading' | 'error' | 'ready';
type SaveState = 'idle' | 'submitting' | 'success' | 'error';

export const NotificationSettings = () => {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);

  const [digestEmail, setDigestEmail] = useState(false);
  const [savedDigestEmail, setSavedDigestEmail] = useState(false);

  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ digest_email: boolean }>(
      '/api/profile/notification-preferences'
    ).then((result) => {
      if (cancelled) return;
      if (!result.data) {
        setLoadError(result.error ?? 'Something went wrong. Please try again.');
        setLoadState('error');
        return;
      }
      setDigestEmail(result.data.digest_email);
      setSavedDigestEmail(result.data.digest_email);
      setLoadState('ready');
    });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const retryLoad = () => {
    setLoadState('loading');
    setReloadKey((k) => k + 1);
  };

  const isDirty = digestEmail !== savedDigestEmail;

  const handleSave = async () => {
    setSaveState('submitting');
    const result = await apiFetch<{ digest_email: boolean }>(
      '/api/profile/notification-preferences',
      { method: 'PATCH', body: { digest_email: digestEmail } }
    );
    if (!result.data) {
      setSaveError(result.error ?? 'Something went wrong. Please try again.');
      setSaveState('error');
      return;
    }
    setDigestEmail(result.data.digest_email);
    setSavedDigestEmail(result.data.digest_email);
    setSaveState('success');
  };

  if (loadState === 'error') {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Notifications
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Choose which events trigger in-app and email alerts.
          </p>
        </div>
        <Separator />
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-lg border border-border bg-card p-5"
        >
          <div className="flex items-start gap-2">
            <AlertCircleIcon
              className="mt-0.5 size-4 shrink-0 text-destructive"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-semibold text-foreground">
                Couldn&apos;t load notification settings
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {loadError}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={retryLoad}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">
          Notifications
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Choose which events trigger in-app and email alerts.
        </p>
      </div>

      <Separator />

      <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
        {mockNotificationToggles.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between px-5 py-4"
          >
            <Label
              htmlFor={item.id}
              className="cursor-pointer text-sm font-normal text-foreground"
            >
              {item.label}
            </Label>
            <Switch id={item.id} defaultChecked={item.enabled} />
          </div>
        ))}

        {loadState === 'loading' ? (
          <div className="flex items-center justify-between px-5 py-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-5 w-9 rounded-full" />
          </div>
        ) : (
          <div className="flex items-center justify-between px-5 py-4">
            <Label
              htmlFor="digest_email"
              className="cursor-pointer text-sm font-normal text-foreground"
            >
              Daily digest at 08:00
            </Label>
            <Switch
              id="digest_email"
              checked={digestEmail}
              onCheckedChange={(checked) => {
                setDigestEmail(checked);
                if (saveState === 'success' || saveState === 'error')
                  setSaveState('idle');
              }}
              aria-label="Daily digest at 08:00 (email)"
            />
          </div>
        )}
      </div>

      {saveState === 'success' && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md bg-[#10B981]/10 px-3 py-2"
        >
          <CheckCircleIcon
            className="mt-0.5 size-3.5 shrink-0 text-[#10B981]"
            aria-hidden="true"
          />
          <p className="text-xs text-foreground">
            Notification settings saved.
          </p>
        </div>
      )}

      {saveState === 'error' && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2"
        >
          <AlertCircleIcon
            className="mt-0.5 size-3.5 shrink-0 text-destructive"
            aria-hidden="true"
          />
          <p className="text-xs text-foreground">{saveError}</p>
        </div>
      )}

      <div>
        <Button
          onClick={handleSave}
          disabled={
            loadState !== 'ready' || !isDirty || saveState === 'submitting'
          }
          aria-busy={saveState === 'submitting'}
        >
          {saveState === 'submitting'
            ? 'Saving…'
            : 'Save notification settings'}
        </Button>
      </div>
    </div>
  );
};
