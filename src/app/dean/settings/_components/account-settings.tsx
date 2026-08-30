'use client';

import { useEffect, useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { apiFetch } from '@/lib/api';
import {
  updateProfileSchema,
  type UpdateProfileInput,
} from '@/lib/validation/schemas';

import { ChangePasswordForm } from '@/components/smartkey/change-password-form';
import { ProfilePhotoUpload } from '@/components/smartkey/profile-photo-upload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

export const AccountSettings = () => {
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [profileLoading, setProfileLoading] = useState(true);

  const form = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { full_name: '' },
  });

  useEffect(() => {
    apiFetch<{
      profile: {
        full_name: string;
        institutional_email: string;
        photo_url: string;
        unit: { name: string } | null;
      };
    }>('/api/profile/me').then((result) => {
      const profile = result.data?.profile;
      if (profile) {
        form.reset({ full_name: profile.full_name ?? '' });
        setEmail(profile.institutional_email ?? '');
        setPhotoUrl(profile.photo_url ?? '');
        setDepartment(profile.unit?.name ?? '');
      }
      setProfileLoading(false);
    });
  }, [form]);

  const handleProfileSubmit = form.handleSubmit(async (data) => {
    const result = await apiFetch('/api/profile/me', {
      method: 'PATCH',
      body: data,
    });
    if (result.error) {
      toast.error(result.error);
      return;
    }
    form.reset(data);
    toast.success('Profile updated successfully.');
  });

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
        <ProfilePhotoUpload
          // eslint-disable-next-line react-hooks/incompatible-library -- react-hook-form's watch() is not compiler-memoizable
          name={form.watch('full_name')}
          loading={profileLoading}
          initialUrl={photoUrl}
        />
        <form onSubmit={handleProfileSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Controller
              name="full_name"
              control={form.control}
              render={({ field, fieldState }) => (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="dean-name">Full name</Label>
                  {profileLoading ? (
                    <Skeleton className="h-9 w-full rounded-md" />
                  ) : (
                    <Input
                      id="dean-name"
                      aria-invalid={fieldState.invalid}
                      {...field}
                    />
                  )}
                  {fieldState.invalid && (
                    <p className="text-xs text-destructive">
                      {fieldState.error?.message}
                    </p>
                  )}
                </div>
              )}
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dean-email">Institutional email</Label>
              {profileLoading ? (
                <Skeleton className="h-9 w-full rounded-md" />
              ) : (
                <Input
                  id="dean-email"
                  type="email"
                  value={email}
                  readOnly
                  className="cursor-not-allowed bg-muted/50 text-muted-foreground"
                />
              )}
              <p className="text-xs text-muted-foreground">
                Your institutional email can&apos;t be changed.
              </p>
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="dean-dept">Unit</Label>
              {profileLoading ? (
                <Skeleton className="h-9 w-full rounded-md" />
              ) : (
                <Input
                  id="dean-dept"
                  value={department}
                  readOnly
                  className="cursor-not-allowed bg-muted/50 text-muted-foreground"
                />
              )}
              <p className="text-xs text-muted-foreground">
                Managed by your CSO. Contact them to update.
              </p>
            </div>
          </div>
          <Button
            type="submit"
            className="mt-4 w-fit"
            disabled={!form.formState.isDirty || form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? 'Saving...' : 'Update profile'}
          </Button>
        </form>
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
