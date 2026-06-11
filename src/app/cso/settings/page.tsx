'use client';

import { useEffect, useState } from 'react';
import { LogOutIcon, UploadIcon } from 'lucide-react';

import { ChangePasswordForm } from '@/components/smartkey/change-password-form';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { createBrowserClient } from '@/lib/supabase/client';

type Section = 'operational' | 'risk' | 'notifications' | 'account';

const navSections: { id: Section; label: string }[] = [
  { id: 'operational', label: 'Operational' },
  { id: 'risk', label: 'Risk rules' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'account', label: 'Account' },
];

const riskRules = [
  {
    id: 'outside_hours',
    name: 'Outside operational hours',
    description: "Request submitted outside the zone's permitted hours.",
    weight: 3,
    enabled: true,
  },
  {
    id: 'outstanding_key',
    name: 'Outstanding key not returned',
    description: 'Requester has an unreturned key from a previous request.',
    weight: 5,
    enabled: true,
  },
  {
    id: 'weekend_no_memo',
    name: 'Weekend without HOD memo',
    description: 'Weekend request without an HOD-approved memo on file.',
    weight: 4,
    enabled: true,
  },
  {
    id: 'excess_frequency',
    name: 'Excess request frequency',
    description:
      'More than the configured number of requests in a rolling 24-hour window.',
    weight: 2,
    enabled: true,
  },
  {
    id: 'not_whitelisted',
    name: 'Collector not whitelisted',
    description: "Requester is not in the key's authorised collector list.",
    weight: 5,
    enabled: true,
  },
];

const notificationToggles = [
  { id: 'anomaly_inapp', label: 'Anomaly alerts (in-app)', enabled: true },
  { id: 'anomaly_email', label: 'Anomaly alerts (email)', enabled: true },
  {
    id: 'signature_email',
    label: 'Signature mismatches (email)',
    enabled: true,
  },
  { id: 'daily_digest', label: 'Daily digest at 08:00', enabled: false },
];

export default function SettingsPage() {
  const [active, setActive] = useState<Section>('operational');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setProfileLoading(false);
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('full_name, institutional_email')
        .eq('id', user.id)
        .single();
      if (data) {
        setFullName(data.full_name ?? '');
        setEmail(data.institutional_email ?? '');
      }
      setProfileLoading(false);
    };
    fetchProfile();
  }, []);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0 lg:flex-row lg:gap-8">
      {/* Side nav — desktop sticky, mobile top tabs */}
      <nav aria-label="Settings sections" className="lg:w-48 lg:shrink-0">
        {/* Mobile: horizontal tabs */}
        <div
          className="flex gap-1 border-b border-border lg:hidden"
          role="tablist"
          aria-label="Settings sections"
        >
          {navSections.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={active === s.id}
              onClick={() => setActive(s.id)}
              className={`px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                active === s.id
                  ? '-mb-px border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Desktop: vertical nav */}
        <ul className="hidden flex-col gap-1 lg:flex">
          {navSections.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setActive(s.id)}
                className={`w-full rounded-md px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                  active === s.id
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
                aria-current={active === s.id ? 'page' : undefined}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Section content */}
      <div className="flex flex-1 flex-col gap-6">
        {/* Operational */}
        {active === 'operational' && (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Operational
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Configure access hours, return deadlines, and code expiry per
                zone.
              </p>
            </div>

            <Separator />

            {/* Zone hours */}
            {(['New Senate', 'Old Senate'] as const).map((zone) => (
              <div
                key={zone}
                className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5"
              >
                <h3 className="text-sm font-semibold text-foreground">
                  {zone}
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      Weekday hours
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col gap-1">
                        <Label
                          htmlFor={`${zone}-weekday-from`}
                          className="text-xs"
                        >
                          From
                        </Label>
                        <Input
                          id={`${zone}-weekday-from`}
                          type="time"
                          defaultValue="06:00"
                          className="w-32"
                        />
                      </div>
                      <span className="mt-5 text-muted-foreground">–</span>
                      <div className="flex flex-col gap-1">
                        <Label
                          htmlFor={`${zone}-weekday-to`}
                          className="text-xs"
                        >
                          To
                        </Label>
                        <Input
                          id={`${zone}-weekday-to`}
                          type="time"
                          defaultValue="22:00"
                          className="w-32"
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
                          htmlFor={`${zone}-weekend-closed`}
                          className="text-xs text-muted-foreground"
                        >
                          Closed
                        </Label>
                        <Switch
                          id={`${zone}-weekend-closed`}
                          defaultChecked={true}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 opacity-40">
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs">From</Label>
                        <Input
                          type="time"
                          defaultValue="08:00"
                          className="w-32"
                          disabled
                        />
                      </div>
                      <span className="mt-5 text-muted-foreground">–</span>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs">To</Label>
                        <Input
                          type="time"
                          defaultValue="18:00"
                          className="w-32"
                          disabled
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="return-deadline">Return deadline</Label>
                <select
                  id="return-deadline"
                  defaultValue="17:00"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <option value="17:00">End of business day (17:00)</option>
                  <option value="18:00">18:00</option>
                  <option value="custom">Custom</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  Default deadline for all key returns.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="code-expiry">Code expiry (minutes)</Label>
                <Input
                  id="code-expiry"
                  type="number"
                  defaultValue={10}
                  min={5}
                  max={60}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Minutes after generation before a verification code expires.
                </p>
              </div>
            </div>

            <div>
              <Button>Save operational settings</Button>
            </div>
          </div>
        )}

        {/* Risk rules */}
        {active === 'risk' && (
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
                  {riskRules.map((rule, idx) => (
                    <tr
                      key={rule.id}
                      className={
                        idx !== riskRules.length - 1
                          ? 'border-b border-border'
                          : ''
                      }
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">
                          {rule.name}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {rule.description}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          type="number"
                          defaultValue={rule.weight}
                          min={1}
                          max={10}
                          className="w-20"
                          aria-label={`Weight for ${rule.name}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Switch
                          id={rule.id}
                          defaultChecked={rule.enabled}
                          aria-label={`Enable ${rule.name}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground">
                Tier thresholds
              </h3>
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tier-low" className="text-xs">
                    Low ≤
                  </Label>
                  <Input
                    id="tier-low"
                    type="number"
                    defaultValue={3}
                    min={1}
                    className="w-20"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tier-medium" className="text-xs">
                    Medium ≤
                  </Label>
                  <Input
                    id="tier-medium"
                    type="number"
                    defaultValue={6}
                    min={1}
                    className="w-20"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">
                    High &gt;
                  </Label>
                  <div className="flex h-9 w-20 items-center rounded-md border border-border bg-muted px-3 text-sm text-muted-foreground">
                    6
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Changes apply to new requests only. Existing risk scores are not
                retroactively updated.
              </p>
            </div>

            <div>
              <Button>Save risk rules</Button>
            </div>
          </div>
        )}

        {/* Notifications */}
        {active === 'notifications' && (
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
              {notificationToggles.map((item) => (
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
            </div>

            <div>
              <Button>Save notification settings</Button>
            </div>
          </div>
        )}

        {/* Account */}
        {active === 'account' && (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Account
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Update your profile and credentials.
              </p>
            </div>

            <Separator />

            {/* Profile */}
            <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground">Profile</h3>
              <div className="flex items-center gap-4">
                <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
                  {profileLoading
                    ? '…'
                    : fullName
                        .split(' ')
                        .map((w) => w[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase() || '?'}
                </div>
                <Button variant="outline" size="sm">
                  <UploadIcon className="size-3.5" aria-hidden="true" />
                  Upload photo
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="full-name">Full name</Label>
                  {profileLoading ? (
                    <Skeleton className="h-9 w-full rounded-md" />
                  ) : (
                    <Input
                      id="full-name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">Institutional email</Label>
                  {profileLoading ? (
                    <Skeleton className="h-9 w-full rounded-md" />
                  ) : (
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      readOnly
                      className="cursor-not-allowed bg-muted/50 text-muted-foreground"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Change password */}
            <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground">
                Change password
              </h3>
              <ChangePasswordForm />
            </div>

            <div className="flex items-center justify-between">
              <Button>Save account settings</Button>
              <Button variant="destructive">
                <LogOutIcon className="size-4" aria-hidden="true" />
                Sign out
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
