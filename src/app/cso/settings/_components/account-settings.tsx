'use client';

import { useEffect, useState } from 'react';
import { LogOutIcon, UploadIcon } from 'lucide-react';

import { ChangePasswordForm } from '@/components/smartkey/change-password-form';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { createBrowserClient } from '@/lib/supabase/client';

export const AccountSettings = () => {
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
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">Account</h2>
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
  );
};
