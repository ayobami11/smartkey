'use client';

import { useEffect, useState } from 'react';

import { AlertCircleIcon, CheckCircleIcon } from 'lucide-react';

import { apiFetch } from '@/lib/api';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';

type Prefs = {
  key_issued_in_app: boolean;
  overdue_email: boolean;
  weekend_decided_email: boolean;
};

const DEFAULTS: Prefs = {
  key_issued_in_app: true,
  overdue_email: true,
  weekend_decided_email: true,
};

const toggleableItems: {
  id: keyof Prefs;
  label: string;
  description: string;
  channel: string;
}[] = [
  {
    id: 'key_issued_in_app',
    label: 'Key issued confirmation',
    description:
      'In-app notification when a verifier marks your key as issued.',
    channel: 'in-app',
  },
  {
    id: 'overdue_email',
    label: 'Return deadline reminder',
    description:
      'Email reminder when your key is approaching or past its return deadline.',
    channel: 'email',
  },
  {
    id: 'weekend_decided_email',
    label: 'Weekend request decided',
    description:
      'Email when your Dean approves or declines a weekend access request.',
    channel: 'email',
  },
];

type LoadState = 'loading' | 'error' | 'ready';
type SaveState = 'idle' | 'submitting' | 'success' | 'error';

export const NotificationSettings = () => {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);

  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [savedPrefs, setSavedPrefs] = useState<Prefs>(DEFAULTS);

  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiFetch<Prefs>('/api/profile/notification-preferences').then((result) => {
      if (cancelled) return;
      if (!result.data) {
        setLoadError(result.error ?? 'Something went wrong. Please try again.');
        setLoadState('error');
        return;
      }
      setPrefs(result.data);
      setSavedPrefs(result.data);
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

  const toggle = (id: keyof Prefs) => {
    setPrefs((prev) => ({ ...prev, [id]: !prev[id] }));
    if (saveState === 'success' || saveState === 'error') setSaveState('idle');
  };

  const isDirty = JSON.stringify(prefs) !== JSON.stringify(savedPrefs);

  const handleSave = async () => {
    setSaveState('submitting');
    const result = await apiFetch<Prefs>(
      '/api/profile/notification-preferences',
      {
        method: 'PATCH',
        body: prefs,
      }
    );
    if (!result.data) {
      setSaveError(result.error ?? 'Something went wrong. Please try again.');
      setSaveState('error');
      return;
    }
    setPrefs(result.data);
    setSavedPrefs(result.data);
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

      <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card shadow-[0_2px_4px_rgba(15,23,42,0.06)]">
        <div className="flex items-center justify-between gap-4 px-4 py-4 opacity-60">
          <div className="min-w-0">
            <Label
              htmlFor="code-email"
              className="cursor-not-allowed text-sm font-medium text-foreground"
            >
              Collection code generated
            </Label>
            <p className="text-xs text-muted-foreground">
              Receive the 6-digit code by email when your request is approved.
            </p>
            <p className="mt-0.5 text-xs capitalize text-muted-foreground/70">
              email &middot; always on
            </p>
          </div>
          <Switch
            id="code-email"
            checked
            disabled
            aria-label="Collection code generated (email, cannot be disabled)"
          />
        </div>

        {loadState === 'loading'
          ? toggleableItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-4 px-4 py-4"
              >
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="mt-1.5 h-3 w-56" />
                </div>
                <Skeleton className="h-5 w-9 rounded-full" />
              </div>
            ))
          : toggleableItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-4 px-4 py-4"
              >
                <div className="min-w-0">
                  <Label
                    htmlFor={item.id}
                    className="cursor-pointer text-sm font-medium text-foreground"
                  >
                    {item.label}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {item.description}
                  </p>
                  <p className="mt-0.5 text-xs capitalize text-muted-foreground/70">
                    {item.channel}
                  </p>
                </div>
                <Switch
                  id={item.id}
                  checked={prefs[item.id]}
                  onCheckedChange={() => toggle(item.id)}
                  aria-label={`${item.label} (${item.channel})`}
                />
              </div>
            ))}
      </div>

      <p className="max-w-md text-xs text-muted-foreground">
        Email notifications are sent to your institutional email address. You
        cannot disable the collection code email — it is required for key
        collection.
      </p>

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
