'use client';

import { useEffect, useState } from 'react';

import { AlertCircleIcon, CheckCircleIcon } from 'lucide-react';

import type { RiskRuleKey } from '@/lib/ai/risk/types';
import { apiFetch } from '@/lib/api';
import { parseDigitInput } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';

type RuleKey = RiskRuleKey;

type RuleRow = { rule_key: RuleKey; weight: number; enabled: boolean };
type TierConfig = { medium_min: number; high_min: number };

const RULE_ORDER: RuleKey[] = [
  'outside_operational_hours',
  'outstanding_key_not_returned',
  'weekend_without_memo',
  'excess_request_frequency',
  'collector_not_whitelisted',
];

const RULE_META: Record<RuleKey, { name: string; description: string }> = {
  outside_operational_hours: {
    name: 'Outside operational hours',
    description: "Request submitted outside the zone's permitted hours.",
  },
  outstanding_key_not_returned: {
    name: 'Outstanding key not returned',
    description: 'Requester has an unreturned key from a previous request.',
  },
  weekend_without_memo: {
    name: 'Weekend without Dean memo',
    description: 'Weekend request without a Dean-approved memo on file.',
  },
  excess_request_frequency: {
    name: 'Excess request frequency',
    description:
      'More than the configured number of requests in a rolling 24-hour window.',
  },
  collector_not_whitelisted: {
    name: 'Collector not whitelisted',
    description: "Requester is not in the key's authorised collector list.",
  },
};

const sortRules = (rows: RuleRow[]): RuleRow[] =>
  [...rows].sort(
    (a, b) => RULE_ORDER.indexOf(a.rule_key) - RULE_ORDER.indexOf(b.rule_key)
  );

type LoadState = 'loading' | 'error' | 'ready';
type SaveState = 'idle' | 'submitting' | 'success' | 'error';

export const RiskRulesSettings = () => {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);

  const [rules, setRules] = useState<RuleRow[]>([]);
  const [tier, setTier] = useState<TierConfig>({
    medium_min: 4,
    high_min: 7,
  });
  const [savedRules, setSavedRules] = useState<RuleRow[]>([]);
  const [savedTier, setSavedTier] = useState<TierConfig>({
    medium_min: 4,
    high_min: 7,
  });

  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ rules: RuleRow[]; tier: TierConfig }>(
      '/api/admin/risk-rules'
    ).then((result) => {
      if (cancelled) return;
      if (!result.data) {
        setLoadError(result.error ?? 'Something went wrong. Please try again.');
        setLoadState('error');
        return;
      }
      const sorted = sortRules(result.data.rules);
      setRules(sorted);
      setSavedRules(sorted);
      setTier(result.data.tier);
      setSavedTier(result.data.tier);
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

  const markEdited = () => {
    if (saveState === 'success' || saveState === 'error') {
      setSaveState('idle');
    }
  };

  const handleWeightChange = (ruleKey: RuleKey, value: string) => {
    setRules((prev) =>
      prev.map((r) => {
        if (r.rule_key !== ruleKey) return r;
        const parsed = parseDigitInput(value, r.weight);
        return Number.isNaN(parsed) ? r : { ...r, weight: parsed };
      })
    );
    markEdited();
  };

  const handleEnabledChange = (ruleKey: RuleKey, enabled: boolean) => {
    setRules((prev) =>
      prev.map((r) => (r.rule_key === ruleKey ? { ...r, enabled } : r))
    );
    markEdited();
  };

  // UI shows inclusive-upper-bound framing ("Low ≤ / Medium ≤ / High >"); the
  // engine and API use inclusive-lower-bound (medium_min/high_min). Convert
  // only at this boundary.
  const lowMax = tier.medium_min - 1;
  const mediumMax = tier.high_min - 1;

  const handleLowMaxChange = (value: string) => {
    const parsed = parseDigitInput(value, lowMax);
    if (Number.isNaN(parsed)) return;
    setTier((prev) => ({ ...prev, medium_min: parsed + 1 }));
    markEdited();
  };

  const handleMediumMaxChange = (value: string) => {
    const parsed = parseDigitInput(value, mediumMax);
    if (Number.isNaN(parsed)) return;
    setTier((prev) => ({ ...prev, high_min: parsed + 1 }));
    markEdited();
  };

  const isLowInRange = lowMax >= 0 && lowMax <= 10;
  const isMediumInRange = mediumMax >= 0 && mediumMax <= 10;
  const isTierRelationValid =
    tier.medium_min >= 1 && tier.high_min > tier.medium_min;
  const isTierValid = isTierRelationValid && isLowInRange && isMediumInRange;
  const areWeightsValid = rules.every((r) => r.weight >= 1 && r.weight <= 10);
  const isDirty =
    JSON.stringify(rules) !== JSON.stringify(savedRules) ||
    JSON.stringify(tier) !== JSON.stringify(savedTier);

  const handleSave = async () => {
    if (!isTierValid || rules.some((r) => r.weight < 1 || r.weight > 10))
      return;
    setSaveState('submitting');
    const result = await apiFetch<{ rules: RuleRow[]; tier: TierConfig }>(
      '/api/admin/risk-rules',
      { method: 'PATCH', body: { rules, tier } }
    );
    if (!result.data) {
      setSaveError(result.error ?? 'Something went wrong. Please try again.');
      setSaveState('error');
      return;
    }
    const sorted = sortRules(result.data.rules);
    setRules(sorted);
    setSavedRules(sorted);
    setTier(result.data.tier);
    setSavedTier(result.data.tier);
    setSaveState('success');
  };

  if (loadState === 'error') {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Risk rules
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Adjust rule weights and tier thresholds. Changes apply to new
            requests only.
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
                Couldn&apos;t load risk rules
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
        <h2 className="text-base font-semibold text-foreground">Risk rules</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Adjust rule weights and tier thresholds. Changes apply to new requests
          only.
        </p>
      </div>

      <Separator />

      <div className="rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">
                Rule
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">
                Weight (1–10)
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">
                Enabled
              </th>
            </tr>
          </thead>
          <tbody>
            {loadState === 'loading'
              ? RULE_ORDER.map((key, idx) => (
                  <tr
                    key={key}
                    className={
                      idx !== RULE_ORDER.length - 1
                        ? 'border-b border-border'
                        : ''
                    }
                  >
                    <td className="px-4 py-3">
                      <div className="flex h-full flex-col justify-center">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="mt-1.5 h-3 w-56" />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex h-full flex-col justify-center">
                        <Skeleton className="h-9 w-20 rounded-md" />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex h-full items-center">
                        <Skeleton className="h-5 w-9 rounded-full" />
                      </div>
                    </td>
                  </tr>
                ))
              : rules.map((rule, idx) => {
                  const meta = RULE_META[rule.rule_key];
                  const weightInvalid = rule.weight < 1 || rule.weight > 10;
                  const isLast = idx === rules.length - 1;
                  return (
                    <tr
                      key={rule.rule_key}
                      className={isLast ? '' : 'border-b border-border'}
                    >
                      <td className="px-4 py-3">
                        <div className="flex h-full flex-col justify-center">
                          <p className="font-medium text-foreground">
                            {meta.name}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {meta.description}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex h-full flex-col justify-center">
                          <Input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={2}
                            value={rule.weight}
                            className="w-20"
                            aria-label={`Weight for ${meta.name}`}
                            aria-invalid={weightInvalid}
                            disabled={!rule.enabled}
                            onChange={(e) =>
                              handleWeightChange(rule.rule_key, e.target.value)
                            }
                          />
                          {weightInvalid && (
                            <p className="mt-1 text-xs text-destructive">
                              1 - 10 only
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex h-full items-center">
                          <Switch
                            id={rule.rule_key}
                            checked={rule.enabled}
                            aria-label={`Enable ${meta.name}`}
                            disabled={weightInvalid}
                            onCheckedChange={(checked) =>
                              handleEnabledChange(rule.rule_key, checked)
                            }
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">
          Tier thresholds
        </h3>
        {loadState === 'loading' ? (
          <div className="flex flex-wrap items-end gap-4">
            <Skeleton className="h-9 w-20 rounded-md" />
            <Skeleton className="h-9 w-20 rounded-md" />
            <Skeleton className="h-9 w-20 rounded-md" />
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tier-low" className="text-xs">
                Low ≤
              </Label>
              <Input
                id="tier-low"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={2}
                value={lowMax}
                className="w-20"
                aria-invalid={!isLowInRange || !isTierRelationValid}
                onChange={(e) => handleLowMaxChange(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tier-medium" className="text-xs">
                Medium ≤
              </Label>
              <Input
                id="tier-medium"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={2}
                value={mediumMax}
                className="w-20"
                aria-invalid={!isMediumInRange || !isTierRelationValid}
                onChange={(e) => handleMediumMaxChange(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">High &gt;</Label>
              <div className="flex h-9 w-20 items-center rounded-md border border-border bg-muted px-3 text-sm text-muted-foreground">
                {mediumMax}
              </div>
            </div>
          </div>
        )}
        {!isTierValid && (
          <p className="text-xs text-destructive">
            {!isLowInRange || !isMediumInRange
              ? 'Tier values must be between 0 and 10.'
              : '"Medium ≤" must be greater than "Low ≤".'}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Changes apply to new requests only. Existing risk scores are not
          retroactively updated.
        </p>
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
            Risk rules saved. New requests will use these settings.
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
            !isTierValid ||
            !areWeightsValid ||
            saveState === 'submitting'
          }
          aria-busy={saveState === 'submitting'}
        >
          {saveState === 'submitting' ? 'Saving…' : 'Save risk rules'}
        </Button>
      </div>
    </div>
  );
};
