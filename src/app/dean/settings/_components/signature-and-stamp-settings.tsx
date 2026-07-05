'use client';

import { useEffect, useRef, useState } from 'react';

import {
  AlertCircleIcon,
  CheckCircleIcon,
  ImageIcon,
  RefreshCwIcon,
  XIcon,
} from 'lucide-react';

import { apiFetch } from '@/lib/api';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

type CardPhase =
  | { phase: 'idle' }
  | { phase: 'previewing'; file: File; previewUrl: string }
  | { phase: 'submitting' }
  | { phase: 'success' }
  | { phase: 'held'; mismatch_pct: number }
  | { phase: 'error'; message: string };

type SignatureCardProps = {
  label: string;
  type: 'signature' | 'stamp';
  alt: string;
  refUrl: string | null;
  loading: boolean;
};

const SignatureCard = ({
  label,
  type,
  alt,
  refUrl: initialRefUrl,
  loading,
}: SignatureCardProps) => {
  const [state, setState] = useState<CardPhase>({ phase: 'idle' });
  const [currentUrl, setCurrentUrl] = useState<string | null>(initialRefUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync the displayed URL if the parent re-fetches
  useEffect(() => {
    setCurrentUrl(initialRefUrl);
  }, [initialRefUrl]);

  const handleReplaceClick = () => {
    setState({ phase: 'idle' });
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setState({
      phase: 'previewing',
      file,
      previewUrl: URL.createObjectURL(file),
    });
  };

  const handleCancel = () => {
    if (state.phase === 'previewing') URL.revokeObjectURL(state.previewUrl);
    setState({ phase: 'idle' });
  };

  const handleApply = async () => {
    if (state.phase !== 'previewing') return;
    const { file, previewUrl } = state;
    setState({ phase: 'submitting' });

    const form = new FormData();
    form.set('type', type);
    form.set('image', file);

    const result = await apiFetch<{
      status: string;
      new_url?: string;
      mismatch_pct?: number;
      message?: string;
    }>('/api/profile/signature', { method: 'POST', body: form });

    URL.revokeObjectURL(previewUrl);

    if (!result.data) {
      setState({
        phase: 'error',
        message: result.error ?? 'Something went wrong. Please try again.',
      });
      return;
    }

    if (result.data.status === 'HELD_SIGNATURE_MISMATCH') {
      setState({ phase: 'held', mismatch_pct: result.data.mismatch_pct ?? 0 });
      return;
    }

    if (result.data.new_url) {
      setCurrentUrl(result.data.new_url);
    }
    setState({ phase: 'success' });
  };

  const displayUrl =
    state.phase === 'previewing' ? state.previewUrl : currentUrl;
  const isReplacing =
    state.phase === 'previewing' || state.phase === 'submitting';

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-[0_2px_4px_rgba(15,23,42,0.06)]">
      <p className="text-sm font-semibold text-foreground">{label}</p>

      {loading ? (
        <Skeleton className="h-28 w-full rounded-md" />
      ) : displayUrl ? (
        <img
          src={displayUrl}
          alt={
            state.phase === 'previewing' ? `${alt} (new — not yet saved)` : alt
          }
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

      {state.phase === 'idle' ||
      state.phase === 'success' ||
      state.phase === 'held' ||
      state.phase === 'error' ? (
        <p className="text-xs text-muted-foreground">
          {currentUrl
            ? 'Reference image uploaded'
            : 'No reference uploaded yet'}
        </p>
      ) : state.phase === 'previewing' ? (
        <p className="text-xs text-muted-foreground">
          New image selected — review above before applying.
        </p>
      ) : null}

      {state.phase === 'success' && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md bg-[#10B981]/10 px-3 py-2"
        >
          <CheckCircleIcon
            className="mt-0.5 size-3.5 shrink-0 text-[#10B981]"
            aria-hidden="true"
          />
          <p className="text-xs text-foreground">
            Reference updated successfully.
          </p>
        </div>
      )}

      {state.phase === 'held' && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md bg-[#F59E0B]/10 px-3 py-2"
        >
          <AlertCircleIcon
            className="mt-0.5 size-3.5 shrink-0 text-[#F59E0B]"
            aria-hidden="true"
          />
          <div>
            <p className="text-xs font-semibold text-foreground">
              Update held for CSO review
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              The new image differs from the current reference (
              {state.mismatch_pct.toFixed(1)}% pixel mismatch). The CSO has been
              notified via the audit trail.
            </p>
          </div>
        </div>
      )}

      {state.phase === 'error' && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2"
        >
          <AlertCircleIcon
            className="mt-0.5 size-3.5 shrink-0 text-destructive"
            aria-hidden="true"
          />
          <p className="text-xs text-foreground">{state.message}</p>
        </div>
      )}

      <div className="flex items-center gap-2">
        {isReplacing ? (
          <>
            <Button
              variant="default"
              size="sm"
              className="w-fit"
              onClick={handleApply}
              disabled={state.phase === 'submitting'}
              aria-busy={state.phase === 'submitting'}
            >
              {state.phase === 'submitting' ? 'Applying…' : 'Apply replacement'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-fit"
              onClick={handleCancel}
              disabled={state.phase === 'submitting'}
            >
              <XIcon className="size-3.5" aria-hidden="true" />
              Cancel
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={handleReplaceClick}
            disabled={loading}
          >
            <RefreshCwIcon className="size-3.5" aria-hidden="true" />
            Replace
          </Button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        aria-label={`Choose new ${label.toLowerCase()} image`}
        className="sr-only"
        onChange={handleFileChange}
      />
    </div>
  );
};

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
          Reference images used for pixel-level verification of Dean approvals.
        </p>
      </div>

      <Separator />

      <div className="grid gap-4 sm:grid-cols-2">
        <SignatureCard
          label="Signature"
          type="signature"
          alt="Signature reference"
          refUrl={signatureUrl}
          loading={loading}
        />
        <SignatureCard
          label="Departmental stamp"
          type="stamp"
          alt="Departmental stamp reference"
          refUrl={stampUrl}
          loading={loading}
        />
      </div>

      <p className="max-w-md text-xs text-muted-foreground">
        Changes are logged to the audit trail. Pending approvals using your
        previous reference are not affected.
      </p>
    </div>
  );
};
