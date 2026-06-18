'use client';

import { useEffect, useState } from 'react';

import { ChangePasswordForm } from '@/components/smartkey/change-password-form';
import { ProfilePhotoUploader } from '@/components/smartkey/profile-photo-uploader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { createBrowserClient } from '@/lib/supabase/client';

export const AccountSettings = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
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
        .select(
          'full_name, institutional_email, photo_url, department:departments!department_id(name)'
        )
        .eq('id', user.id)
        .single();
      if (data) {
        setName((data.full_name as string | null) ?? '');
        setEmail((data.institutional_email as string | null) ?? '');
        setPhotoUrl((data.photo_url as string | null) ?? '');
        const dept = data.department as { name: string } | null;
        setDepartment(dept?.name ?? '');
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

      {/* Profile card */}
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">Profile</h3>
        <ProfilePhotoUploader
          name={name}
          loading={profileLoading}
          initialUrl={photoUrl}
        />
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
        <Button className="w-fit">Update profile</Button>
      </div>

      {/* Change password card */}
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">
          Change password
        </h3>
        <ChangePasswordForm />
      </div>
    </div>
  );
};
