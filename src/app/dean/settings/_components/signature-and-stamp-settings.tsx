'use client';

import { useEffect, useState } from 'react';

import { ImageIcon, RefreshCwIcon } from 'lucide-react';

import { apiFetch } from '@/lib/api';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

export const SignatureAndStampSettings = () => {
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [stampUrl, setStampUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{
      profile: {
        signature_ref_url: string | null;
        stamp_ref_url: string | null;
      };
    }>('/api/profile/me').then((result) => {
      const profile = result.data?.profile;
      if (profile) {
        setSignatureUrl(profile.signature_ref_url ?? null);
        setStampUrl(profile.stamp_ref_url ?? null);
      }
      setLoading(false);
    });
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">
          Signature &amp; stamp
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Reference images used for pixel-level verification of HOD approvals.
        </p>
      </div>

      <Separator />

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Signature card */}
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-[0_2px_4px_rgba(15,23,42,0.06)]">
          <p className="text-sm font-semibold text-foreground">Signature</p>
          {loading ? (
            <Skeleton className="h-28 w-full rounded-md" />
          ) : signatureUrl ? (
            <img
              src={signatureUrl}
              alt="Signature reference"
              className="h-28 w-full rounded-md object-contain bg-muted/60"
            />
          ) : (
            <div className="flex h-28 items-center justify-center rounded-md border border-border bg-muted/60">
              <ImageIcon
                className="size-7 text-muted-foreground/40"
                aria-hidden="true"
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {signatureUrl
              ? 'Reference image uploaded'
              : 'No reference uploaded yet'}
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
          {loading ? (
            <Skeleton className="h-28 w-full rounded-md" />
          ) : stampUrl ? (
            <img
              src={stampUrl}
              alt="Departmental stamp reference"
              className="h-28 w-full rounded-md object-contain bg-muted/60"
            />
          ) : (
            <div className="flex h-28 items-center justify-center rounded-md border border-border bg-muted/60">
              <ImageIcon
                className="size-7 text-muted-foreground/40"
                aria-hidden="true"
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {stampUrl
              ? 'Reference image uploaded'
              : 'No reference uploaded yet'}
          </p>
          <Button variant="outline" size="sm" className="w-fit">
            <RefreshCwIcon className="size-3.5" aria-hidden="true" />
            Replace
          </Button>
        </div>
      </div>

      <p className="max-w-md text-xs text-muted-foreground">
        Changes are logged to the audit trail. Pending approvals using your
        previous reference are not affected.
      </p>
    </div>
  );
};
