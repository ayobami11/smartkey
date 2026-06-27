'use client';

import { CloudUploadIcon, FileTextIcon, RefreshCwIcon } from 'lucide-react';

import { FieldError } from '@/components/ui/field';
import { LETTER_MAX_BYTES } from '@/lib/validation/schemas';

type AuthorizationLetterUploadProps = {
  id?: string;
  file: File | null;
  onPickClick: () => void;
  onRemove: () => void;
  error?: { message?: string };
  invalid?: boolean;
};

const MAX_MB = LETTER_MAX_BYTES / (1024 * 1024);

export const AuthorizationLetterUpload = ({
  id,
  file,
  onPickClick,
  onRemove,
  error,
  invalid,
}: AuthorizationLetterUploadProps) => (
  <>
    {!file ? (
      <button
        id={id}
        type="button"
        onClick={onPickClick}
        aria-invalid={invalid}
        className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/30 p-8 text-center transition-colors hover:border-primary/50 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <CloudUploadIcon
          className="size-7 text-muted-foreground"
          aria-hidden="true"
        />
        <div>
          <p className="text-sm font-medium text-foreground">
            Click to upload the signed letter
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            PDF, PNG, or JPG · max {MAX_MB} MB
          </p>
        </div>
      </button>
    ) : (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3">
        <div className="flex min-w-0 items-center gap-2">
          <FileTextIcon
            className="size-5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="truncate text-sm text-foreground">{file.name}</span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <RefreshCwIcon className="size-3.5" aria-hidden="true" />
          Replace
        </button>
      </div>
    )}
    {invalid && <FieldError errors={[error]} />}
  </>
);
