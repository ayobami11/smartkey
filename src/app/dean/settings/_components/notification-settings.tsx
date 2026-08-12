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
  weekend_submitted_in_app: boolean;
  weekend_submitted_email: boolean;
};

const DEFAULTS: Prefs = {
  weekend_submitted_in_app: true,
  weekend_submitted_email: true,
};

const toggleableItems: {
  id: keyof Prefs;
  label: string;
  channel: string;
}[] = [
  {
    id: 'weekend_submitted_in_app',
    label: 'Weekend requests submitted',
    channel: 'in-app',
  },
  {
    id: 'weekend_submitted_email',
    label: 'Weekend requests submitted',
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
      const loaded = {
        weekend_submitted_in_app: result.data.weekend_submitted_in_app,
        weekend_submitted_email: result.data.weekend_submitted_email,
      };
      setPrefs(loaded);
      setSavedPrefs(loaded);
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
    const saved = {
      weekend_submitted_in_app: result.data.weekend_submitted_in_app,
      weekend_submitted_email: result.data.weekend_submitted_email,
    };
    setPrefs(saved);
    setSavedPrefs(saved);
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
        {loadState === 'loading'
          ? toggleableItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between px-5 py-4"
              >
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-4 w-48" />
                </div>
                <Skeleton className="h-5 w-9 rounded-full" />
              </div>
            ))
          : toggleableItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between px-5 py-4"
              >
                <div>
                  <Label
                    htmlFor={item.id}
                    className="cursor-pointer text-sm font-normal text-foreground"
                  >
                    {item.label}
                  </Label>
                  <p className="text-xs capitalize text-muted-foreground">
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

        <div className="flex items-center justify-between px-5 py-4 opacity-60">
          <div>
            <Label
              htmlFor="digest-email"
              className="cursor-not-allowed text-sm font-normal text-foreground"
            >
              Daily digest of your department&apos;s activity
            </Label>
            <p className="text-xs text-muted-foreground">
              Email &middot; not yet available
            </p>
          </div>
          <Switch
            id="digest-email"
            checked={false}
            disabled
            aria-label="Daily digest of your department's activity (email, not yet available)"
          />
        </div>
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
