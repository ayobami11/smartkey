'use client';

import { useEffect, useState } from 'react';
import { ImageIcon, LogOutIcon, RefreshCwIcon, UploadIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { createBrowserClient } from '@/lib/supabase/client';

type Section = 'account' | 'signature' | 'notifications';

const navItems: { id: Section; label: string }[] = [
  { id: 'account', label: 'Account' },
  { id: 'signature', label: 'Signature & stamp' },
  { id: 'notifications', label: 'Notifications' },
];

const notificationItems = [
  {
    id: 'weekend-in-app',
    label: 'Weekend requests submitted',
    channel: 'in-app',
  },
  {
    id: 'weekend-email',
    label: 'Weekend requests submitted',
    channel: 'email',
  },
  {
    id: 'digest-email',
    label: "Daily digest of your department's activity",
    channel: 'email',
  },
] as const;

export default function HodProfilePage() {
  const [active, setActive] = useState<Section>('account');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('');
  const [profileLoading, setProfileLoading] = useState(true);

  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  const [notifications, setNotifications] = useState({
    'weekend-in-app': true,
    'weekend-email': true,
    'digest-email': false,
  });

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
        .select(
          'full_name, institutional_email, department:departments!department_id(name)'
        )
        .eq('id', user.id)
        .single();
      if (data) {
        setName((data.full_name as string | null) ?? '');
        setEmail((data.institutional_email as string | null) ?? '');
        const dept = data.department as { name: string } | null;
        setDepartment(dept?.name ?? '');
      }
      setProfileLoading(false);
    };
    fetchProfile();
  }, []);

  const handlePasswordChange = async () => {
    setPwError(null);
    setPwSuccess(false);
    if (!pwCurrent || !pwNew || !pwConfirm) {
      setPwError('All password fields are required.');
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwError('New passwords do not match.');
      return;
    }
    setPwLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: pwCurrent,
          new_password: pwNew,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setPwError(json.error ?? 'Failed to update password.');
        return;
      }
      setPwSuccess(true);
      setPwCurrent('');
      setPwNew('');
      setPwConfirm('');
    } catch {
      setPwError('Network error. Check your connection and try again.');
    } finally {
      setPwLoading(false);
    }
  };

  const toggleNotification = (id: keyof typeof notifications) => {
    setNotifications((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Profile</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Manage your account, signature references, and preferences.
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-6 lg:flex-row lg:items-start">
        {/* Desktop nav / Mobile tabs */}
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
          {/* Account */}
          {active === 'account' && (
            <div className="flex flex-col gap-6">
              <h2 className="text-base font-semibold text-foreground">
                Account
              </h2>
              <Separator />

              {/* Profile card */}
              <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
                <h3 className="text-sm font-semibold text-foreground">
                  Profile
                </h3>
                <div className="flex items-center gap-4">
                  <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
                    {profileLoading
                      ? '…'
                      : name
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
                    <Label htmlFor="hod-name">Full name</Label>
                    {profileLoading ? (
                      <Skeleton className="h-9 w-full rounded-md" />
                    ) : (
                      <Input
                        id="hod-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="hod-email">Institutional email</Label>
                    {profileLoading ? (
                      <Skeleton className="h-9 w-full rounded-md" />
                    ) : (
                      <Input
                        id="hod-email"
                        type="email"
                        value={email}
                        readOnly
                        className="cursor-not-allowed bg-muted/50 text-muted-foreground"
                      />
                    )}
                    <p className="text-xs text-muted-foreground">
                      Managed by CSO. Contact them to update.
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <Label htmlFor="hod-dept">Department</Label>
                    {profileLoading ? (
                      <Skeleton className="h-9 w-full rounded-md" />
                    ) : (
                      <Input
                        id="hod-dept"
                        value={department}
                        readOnly
                        className="cursor-not-allowed bg-muted/50 text-muted-foreground"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Change password card */}
              <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
                <h3 className="text-sm font-semibold text-foreground">
                  Change password
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="hod-current-password">
                      Current password
                    </Label>
                    <Input
                      id="hod-current-password"
                      type="password"
                      autoComplete="current-password"
                      value={pwCurrent}
                      onChange={(e) => setPwCurrent(e.target.value)}
                    />
                  </div>
                  <div />
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="hod-new-password">New password</Label>
                    <Input
                      id="hod-new-password"
                      type="password"
                      autoComplete="new-password"
                      value={pwNew}
                      onChange={(e) => setPwNew(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="hod-confirm-password">
                      Confirm new password
                    </Label>
                    <Input
                      id="hod-confirm-password"
                      type="password"
                      autoComplete="new-password"
                      value={pwConfirm}
                      onChange={(e) => setPwConfirm(e.target.value)}
                    />
                  </div>
                </div>
                {pwError && (
                  <p className="text-sm text-destructive" role="alert">
                    {pwError}
                  </p>
                )}
                {pwSuccess && (
                  <p className="text-sm text-[#10B981]" role="status">
                    Password updated successfully.
                  </p>
                )}
                <div>
                  <Button
                    variant="outline"
                    disabled={pwLoading}
                    onClick={handlePasswordChange}
                  >
                    {pwLoading ? 'Updating…' : 'Update password'}
                  </Button>
                </div>
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

          {/* Signature & stamp */}
          {active === 'signature' && (
            <div className="flex flex-col gap-6">
              <h2 className="text-base font-semibold text-foreground">
                Signature &amp; stamp
              </h2>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* Signature card */}
                <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-[0_2px_4px_rgba(15,23,42,0.06)]">
                  <p className="text-sm font-semibold text-foreground">
                    Signature
                  </p>
                  <div className="flex h-28 items-center justify-center rounded-md border border-border bg-muted/60">
                    <ImageIcon
                      className="size-7 text-muted-foreground/40"
                      aria-hidden="true"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Last updated 14 Feb 2026
                  </p>
                  <Button variant="outline" size="sm" className="w-fit">
                    <RefreshCwIcon className="size-3.5" aria-hidden="true" />
                    Replace
                  </Button>
                </div>

                {/* Stamp card */}
                <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-[0_2px_4px_rgba(15,23,42,0.06)]">
                  <p className="text-sm font-semibold text-foreground">
                    Departmental stamp
                  </p>
                  <div className="flex h-28 items-center justify-center rounded-md border border-border bg-muted/60">
                    <ImageIcon
                      className="size-7 text-muted-foreground/40"
                      aria-hidden="true"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Last updated 14 Feb 2026
                  </p>
                  <Button variant="outline" size="sm" className="w-fit">
                    <RefreshCwIcon className="size-3.5" aria-hidden="true" />
                    Replace
                  </Button>
                </div>
              </div>

              <p className="max-w-md text-xs text-muted-foreground">
                Changes are logged to the audit trail. Pending approvals using
                your previous reference are not affected.
              </p>
            </div>
          )}

          {/* Notifications */}
          {active === 'notifications' && (
            <div className="flex flex-col gap-6">
              <h2 className="text-base font-semibold text-foreground">
                Notifications
              </h2>

              <div className="flex flex-col gap-0 divide-y divide-border rounded-lg border border-border bg-card shadow-[0_2px_4px_rgba(15,23,42,0.06)]">
                {notificationItems.map((item) => {
                  const checked =
                    notifications[item.id as keyof typeof notifications];
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-4 px-4 py-4"
                    >
                      <div>
                        <Label
                          htmlFor={item.id}
                          className="cursor-pointer text-sm font-medium text-foreground"
                        >
                          {item.label}
                        </Label>
                        <p className="text-xs capitalize text-muted-foreground">
                          {item.channel}
                        </p>
                      </div>
                      <Switch
                        id={item.id}
                        checked={checked}
                        onCheckedChange={() =>
                          toggleNotification(
                            item.id as keyof typeof notifications
                          )
                        }
                        aria-label={`${item.label} (${item.channel})`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
