'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircleIcon, CloudUploadIcon, RefreshCwIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createBrowserClient } from '@/lib/supabase/client';

type Role = 'VERIFIER' | 'REQUESTER';

export default function ActivatePage() {
  const router = useRouter();
  const [role, setRole] = useState<Role | null>(null);
  const [checking, setChecking] = useState(true);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.replace('/login?error=invalid-link');
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.session.user.id)
        .single();

      const r = (profile as { role: string } | null)?.role;
      if (r !== 'VERIFIER' && r !== 'REQUESTER') {
        router.replace('/login');
        return;
      }
      setRole(r as Role);
      setChecking(false);
    });
  }, [router]);

  const handleSubmit = async () => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (role === 'REQUESTER' && !photoFile) {
      setError('Passport photo is required');
      return;
    }

    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.append('password', password);
    if (photoFile) formData.append('passport_photo', photoFile);

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      body: formData,
    });

    const json = (await res.json()) as { error?: string };

    if (!res.ok) {
      setError(json.error ?? 'Something went wrong. Please try again.');
      setSubmitting(false);
      return;
    }

    setDone(true);
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Setting up your account…
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 text-center shadow-[0_2px_4px_rgba(15,23,42,0.06)]">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircleIcon
              className="size-7 text-emerald-700"
              aria-hidden="true"
            />
          </div>
          <h2 className="text-lg font-semibold text-foreground">
            Account activated.
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {"You're ready to use SmartKey. Sign in to continue."}
          </p>
          <Button asChild className="mt-6 w-full">
            <a href="/login">Go to sign in</a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">
            Activate your account
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {role === 'REQUESTER'
              ? 'Set a password and upload your passport photo to finish setup.'
              : 'Set a password to finish setup.'}
          </p>
        </div>

        <div className="flex flex-col gap-5 rounded-lg border border-border bg-card p-6 shadow-[0_2px_4px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              autoComplete="new-password"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm-password">Confirm password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat password"
              autoComplete="new-password"
            />
          </div>

          {role === 'REQUESTER' && (
            <div className="flex flex-col gap-1.5">
              <Label>Passport photo</Label>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                aria-label="Passport photo file"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setPhotoFile(file);
                }}
              />
              {!photoFile ? (
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/30 p-8 text-center transition-colors hover:border-primary/50 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <CloudUploadIcon
                    className="size-7 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Click to browse
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      PNG or JPG · max 5 MB
                    </p>
                  </div>
                </button>
              ) : (
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
                  <p className="text-sm text-foreground">{photoFile.name}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoFile(null);
                      if (photoInputRef.current)
                        photoInputRef.current.value = '';
                    }}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <RefreshCwIcon className="size-3.5" aria-hidden="true" />
                    Replace
                  </button>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            onClick={handleSubmit}
            disabled={
              submitting ||
              password.length < 8 ||
              password !== confirmPassword ||
              (role === 'REQUESTER' && !photoFile)
            }
            className="w-full"
          >
            {submitting ? 'Activating…' : 'Activate account'}
          </Button>
        </div>
      </div>
    </div>
  );
}
