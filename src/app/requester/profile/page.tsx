'use client';

import { useState } from 'react';
import { CameraIcon, KeyRoundIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// ── Types ──────────────────────────────────────────────────────────────────

type Section = 'account' | 'notifications' | 'appearance';

// ── Data ──────────────────────────────────────────────────────────────────

const navItems: { id: Section; label: string }[] = [
  { id: 'account', label: 'Account' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'appearance', label: 'Appearance' },
];

const notificationItems = [
  {
    id: 'code-email',
    label: 'Collection code generated',
    description:
      'Receive the 6-digit code by email when your request is approved.',
    channel: 'email',
  },
  {
    id: 'key-issued-in-app',
    label: 'Key issued confirmation',
    description:
      'In-app notification when a verifier marks your key as issued.',
    channel: 'in-app',
  },
  {
    id: 'overdue-email',
    label: 'Return deadline reminder',
    description:
      'Email reminder when your key is approaching or past its return deadline.',
    channel: 'email',
  },
  {
    id: 'weekend-decided-email',
    label: 'Weekend request decided',
    description:
      'Email when your HOD approves or declines a weekend access request.',
    channel: 'email',
  },
] as const;

type NotificationId = (typeof notificationItems)[number]['id'];

// ── Component ──────────────────────────────────────────────────────────────

export default function RequesterProfilePage() {
  const [active, setActive] = useState<Section>('account');
  const [name, setName] = useState('');
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system');
  const [notifications, setNotifications] = useState<
    Record<NotificationId, boolean>
  >({
    'code-email': true,
    'key-issued-in-app': true,
    'overdue-email': true,
    'weekend-decided-email': true,
  });

  const toggleNotification = (id: NotificationId) => {
    setNotifications((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Derive initials from name for the avatar
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Profile</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Manage your account details, notifications, and appearance.
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-6 lg:flex-row lg:items-start">
        {/* Section nav — horizontal tabs on mobile, vertical sidebar on desktop */}
        <nav
          aria-label="Profile sections"
          className="flex gap-1 overflow-x-auto border-b border-border pb-0 lg:w-48 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r lg:pb-0 lg:pr-2"
        >
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActive(item.id)}
              aria-current={active === item.id ? 'page' : undefined}
              className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:w-full lg:text-left ${
                active === item.id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Section content */}
        <div className="min-w-0 flex-1">
          {/* ── Account ── */}
          {active === 'account' && (
            <div className="flex flex-col gap-6">
              <h2 className="text-base font-semibold text-foreground">
                Account
              </h2>

              {/* Avatar */}
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-xl font-semibold text-primary">
                    {initials || (
                      <span className="text-base text-muted-foreground">?</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full border border-border bg-card shadow-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    aria-label="Upload profile photo"
                  >
                    <CameraIcon
                      className="size-3.5 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </button>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Profile photo
                  </p>
                  <p className="text-xs text-muted-foreground">
                    PNG or JPG · max 2 MB
                  </p>
                </div>
              </div>

              {/* Fields */}
              <div className="flex flex-col gap-4 sm:max-w-md">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="req-name">Full name</Label>
                  <Input
                    id="req-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your full name"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="req-email">Institutional email</Label>
                  <Input
                    id="req-email"
                    type="email"
                    defaultValue=""
                    readOnly
                    placeholder="your@unilag.edu.ng"
                    className="cursor-not-allowed bg-muted/50 text-muted-foreground"
                  />
                  <p className="text-xs text-muted-foreground">
                    Managed by CSO. Contact them to update.
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="req-dept">Department</Label>
                  <Input
                    id="req-dept"
                    readOnly
                    placeholder="Your department"
                    className="cursor-not-allowed bg-muted/50 text-muted-foreground"
                  />
                </div>

                <Button className="w-fit">Save changes</Button>
              </div>
            </div>
          )}

          {/* ── Notifications ── */}
          {active === 'notifications' && (
            <div className="flex flex-col gap-6">
              <h2 className="text-base font-semibold text-foreground">
                Notifications
              </h2>

              <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card shadow-[0_2px_4px_rgba(15,23,42,0.06)]">
                {notificationItems.map((item) => {
                  const checked = notifications[item.id];
                  return (
                    <label
                      key={item.id}
                      className="flex cursor-pointer items-center justify-between gap-4 px-4 py-4"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {item.label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.description}
                        </p>
                        <p className="mt-0.5 text-xs capitalize text-muted-foreground/70">
                          {item.channel}
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={checked}
                        onChange={() => toggleNotification(item.id)}
                        aria-label={`${item.label} (${item.channel})`}
                      />
                      {/* Toggle pill */}
                      <div
                        className="relative h-5 w-9 shrink-0 rounded-full bg-muted transition-colors peer-checked:bg-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring"
                        aria-hidden="true"
                      >
                        <div
                          className={`absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform ${
                            checked ? 'translate-x-4' : 'translate-x-0.5'
                          }`}
                        />
                      </div>
                    </label>
                  );
                })}
              </div>

              <p className="max-w-md text-xs text-muted-foreground">
                Email notifications are sent to your institutional email
                address. You cannot disable the collection code email — it is
                required for key collection.
              </p>
            </div>
          )}

          {/* ── Appearance ── */}
          {active === 'appearance' && (
            <div className="flex flex-col gap-6">
              <h2 className="text-base font-semibold text-foreground">
                Appearance
              </h2>

              <div className="flex flex-col gap-4 sm:max-w-md">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="req-theme">Theme</Label>
                  <select
                    id="req-theme"
                    value={theme}
                    onChange={(e) => setTheme(e.target.value as typeof theme)}
                    className="flex h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <option value="system">System</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-3 border-t border-border pt-6 sm:max-w-md">
                <Button variant="outline" className="w-fit">
                  <KeyRoundIcon className="size-4" aria-hidden="true" />
                  Change password
                </Button>
                <Button
                  variant="ghost"
                  className="w-fit text-destructive hover:bg-destructive/5 hover:text-destructive"
                >
                  Sign out
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
