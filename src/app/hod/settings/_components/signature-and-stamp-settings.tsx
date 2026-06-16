import { ImageIcon, RefreshCwIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

export const SignatureAndStampSettings = () => (
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
      Changes are logged to the audit trail. Pending approvals using your
      previous reference are not affected.
    </p>
  </div>
);
