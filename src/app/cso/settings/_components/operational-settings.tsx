'use client';

import { useEffect, useState } from 'react';

import { AlertCircleIcon, CheckCircleIcon } from 'lucide-react';

import { ZONES, ZONE_LABELS, type Zone } from '@/lib/constants';
import { apiFetch } from '@/lib/api';
import { parseDigitInput } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';

type ZoneRow = {
  zone: Zone;
  weekday_open: string;
  weekday_close: string;
  weekend_closed: boolean;
  weekend_open: string | null;
  weekend_close: string | null;
};

type Config = { return_deadline_time: string; code_expiry_minutes: number };
type OperationalConfigResponse = { zones: ZoneRow[] } & Config;

const sortZones = (rows: ZoneRow[]): ZoneRow[] =>
  [...rows].sort((a, b) => ZONES.indexOf(a.zone) - ZONES.indexOf(b.zone));

type LoadState = 'loading' | 'error' | 'ready';
type SaveState = 'idle' | 'submitting' | 'success' | 'error';

export const OperationalSettings = () => {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);

  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [config, setConfig] = useState<Config>({
    return_deadline_time: '17:00',
    code_expiry_minutes: 10,
  });
  const [savedZones, setSavedZones] = useState<ZoneRow[]>([]);
  const [savedConfig, setSavedConfig] = useState<Config>({
    return_deadline_time: '17:00',
    code_expiry_minutes: 10,
  });

  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiFetch<OperationalConfigResponse>('/api/admin/operational-config').then(
      (result) => {
        if (cancelled) return;
        if (!result.data) {
          setLoadError(
            result.error ?? 'Something went wrong. Please try again.'
          );
          setLoadState('error');
          return;
        }
        const sorted = sortZones(result.data.zones);
        const cfg = {
          return_deadline_time: result.data.return_deadline_time,
          code_expiry_minutes: result.data.code_expiry_minutes,
        };
        setZones(sorted);
        setSavedZones(sorted);
        setConfig(cfg);
        setSavedConfig(cfg);
        setLoadState('ready');
      }
    );
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const retryLoad = () => {
    setLoadState('loading');
    setReloadKey((k) => k + 1);
  };

  const markEdited = () => {
    if (saveState === 'success' || saveState === 'error') {
      setSaveState('idle');
    }
  };

  const updateZone = (zone: Zone, patch: Partial<ZoneRow>) => {
    setZones((prev) =>
      prev.map((z) => (z.zone === zone ? { ...z, ...patch } : z))
    );
    markEdited();
  };

  const handleWeekendClosedChange = (zone: Zone, closed: boolean) => {
    updateZone(zone, {
      weekend_closed: closed,
      weekend_open: closed ? null : '08:00',
      weekend_close: closed ? null : '18:00',
    });
  };

  const handleCodeExpiryChange = (value: string) => {
    const parsed = parseDigitInput(value, config.code_expiry_minutes);
    if (Number.isNaN(parsed)) return;
    setConfig((prev) => ({ ...prev, code_expiry_minutes: parsed }));
    markEdited();
  };

  const handleReturnDeadlineChange = (value: string) => {
    setConfig((prev) => ({ ...prev, return_deadline_time: value }));
    markEdited();
  };

  const zoneErrors = (z: ZoneRow): string | null => {
    if (z.weekday_open >= z.weekday_close)
      return 'Weekday "From" must be before "To".';
    if (!z.weekend_closed) {
      if (!z.weekend_open || !z.weekend_close)
        return 'Weekend hours are required when the zone is not closed.';
      if (z.weekend_open >= z.weekend_close)
        return 'Weekend "From" must be before "To".';
    }
    return null;
  };

  const isCodeExpiryValid =
    config.code_expiry_minutes >= 5 && config.code_expiry_minutes <= 60;
  const isValid =
    isCodeExpiryValid && zones.every((z) => zoneErrors(z) === null);
  const isDirty =
    JSON.stringify(zones) !== JSON.stringify(savedZones) ||
    JSON.stringify(config) !== JSON.stringify(savedConfig);

  const handleSave = async () => {
    if (!isValid) return;
    setSaveState('submitting');
    const result = await apiFetch<OperationalConfigResponse>(
      '/api/admin/operational-config',
      { method: 'PATCH', body: { zones, ...config } }
    );
    if (!result.data) {
      setSaveError(result.error ?? 'Something went wrong. Please try again.');
      setSaveState('error');
      return;
    }
    const sorted = sortZones(result.data.zones);
    const cfg = {
      return_deadline_time: result.data.return_deadline_time,
      code_expiry_minutes: result.data.code_expiry_minutes,
    };
    setZones(sorted);
    setSavedZones(sorted);
    setConfig(cfg);
    setSavedConfig(cfg);
    setSaveState('success');
  };

  if (loadState === 'error') {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Operational
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Configure access hours, return deadlines, and code expiry per zone.
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
                Couldn&apos;t load operational settings
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
        <h2 className="text-base font-semibold text-foreground">Operational</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Configure access hours, return deadlines, and code expiry per zone.
        </p>
      </div>

      <Separator />

      {loadState === 'loading'
        ? ZONES.map((zone) => (
            <div
              key={zone}
              className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5"
            >
              <Skeleton className="h-4 w-32" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Skeleton className="h-16 w-full rounded-md" />
                <Skeleton className="h-16 w-full rounded-md" />
              </div>
            </div>
          ))
        : zones.map((z) => {
            const zoneError = zoneErrors(z);
            return (
              <div
                key={z.zone}
                className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5"
              >
                <h3 className="text-sm font-semibold text-foreground">
                  {ZONE_LABELS[z.zone]}
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      Weekday hours
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col gap-1">
                        <Label
                          htmlFor={`${z.zone}-weekday-from`}
                          className="text-xs"
                        >
                          From
                        </Label>
                        <Input
                          id={`${z.zone}-weekday-from`}
                          type="time"
                          value={z.weekday_open}
                          className="w-32"
                          aria-invalid={!!zoneError}
                          onChange={(e) =>
                            updateZone(z.zone, { weekday_open: e.target.value })
                          }
                        />
                      </div>
                      <span className="mt-5 text-muted-foreground">–</span>
                      <div className="flex flex-col gap-1">
                        <Label
                          htmlFor={`${z.zone}-weekday-to`}
                          className="text-xs"
                        >
                          To
                        </Label>
                        <Input
                          id={`${z.zone}-weekday-to`}
                          type="time"
                          value={z.weekday_close}
                          className="w-32"
                          aria-invalid={!!zoneError}
                          onChange={(e) =>
                            updateZone(z.zone, {
                              weekday_close: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground">
                        Weekend hours
                      </p>
                      <div className="flex items-center gap-2">
                        <Label
                          htmlFor={`${z.zone}-weekend-closed`}
                          className="text-xs text-muted-foreground"
                        >
                          Closed
                        </Label>
                        <Switch
                          id={`${z.zone}-weekend-closed`}
                          checked={z.weekend_closed}
                          onCheckedChange={(checked) =>
                            handleWeekendClosedChange(z.zone, checked)
                          }
                        />
                      </div>
                    </div>
                    <div
                      className={
                        z.weekend_closed
                          ? 'flex items-center gap-2 opacity-40'
                          : 'flex items-center gap-2'
                      }
                    >
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs">From</Label>
                        <Input
                          type="time"
                          value={z.weekend_open ?? ''}
                          className="w-32"
                          disabled={z.weekend_closed}
                          aria-invalid={!!zoneError}
                          onChange={(e) =>
                            updateZone(z.zone, { weekend_open: e.target.value })
                          }
                        />
                      </div>
                      <span className="mt-5 text-muted-foreground">–</span>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs">To</Label>
                        <Input
                          type="time"
                          value={z.weekend_close ?? ''}
                          className="w-32"
                          disabled={z.weekend_closed}
                          aria-invalid={!!zoneError}
                          onChange={(e) =>
                            updateZone(z.zone, {
                              weekend_close: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
                {zoneError && (
                  <p className="text-xs text-destructive">{zoneError}</p>
                )}
              </div>
            );
          })}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="return-deadline">Return deadline</Label>
          {loadState === 'loading' ? (
            <Skeleton className="h-9 w-full rounded-md" />
          ) : (
            <Input
              id="return-deadline"
              type="time"
              value={config.return_deadline_time}
              onChange={(e) => handleReturnDeadlineChange(e.target.value)}
            />
          )}
          <p className="text-xs text-muted-foreground">
            Default deadline for all key returns.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="code-expiry">Code expiry (minutes)</Label>
          {loadState === 'loading' ? (
            <Skeleton className="h-9 w-full rounded-md" />
          ) : (
            <Input
              id="code-expiry"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={2}
              value={config.code_expiry_minutes}
              className="w-full"
              aria-invalid={!isCodeExpiryValid}
              onChange={(e) => handleCodeExpiryChange(e.target.value)}
            />
          )}
          {!isCodeExpiryValid && (
            <p className="text-xs text-destructive">
              Must be between 5 and 60.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Minutes after generation before a verification code expires.
          </p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Changes apply to new requests only. Requests already in progress keep
        their original deadline and code expiry.
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
            Operational settings saved. New requests will use these settings.
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
            loadState !== 'ready' ||
            !isDirty ||
            !isValid ||
            saveState === 'submitting'
          }
          aria-busy={saveState === 'submitting'}
        >
          {saveState === 'submitting' ? 'Saving…' : 'Save operational settings'}
        </Button>
      </div>
    </div>
  );
};
