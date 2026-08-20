'use client';

import { useRef } from 'react';

import { CloudUploadIcon, RefreshCwIcon } from 'lucide-react';

import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from '@/components/ui/attachment';
import { FieldError } from '@/components/ui/field';
import { useObjectUrl } from '@/hooks/use-object-url';
import { formatFileSize } from '@/lib/utils';

type ImageUploadFieldProps = {
  field: {
    value: File | undefined;
    onChange: (file: File | undefined) => void;
  };
  fieldState: {
    invalid: boolean;
    error?: { message?: string };
  };
  /** e.g. "signature image" — used in the input's aria-label and the Replace action's aria-label. */
  label: string;
  /** e.g. "Signature preview" — the preview image's alt text. */
  previewAlt: string;
  /** Sets the field's error message — same instant type/size feedback the previous inline handler gave, ahead of the zod resolver's on-submit check. */
  setError: (message: string) => void;
  clearError: () => void;
};

export const ImageUploadField = ({
  field,
  fieldState,
  label,
  previewAlt,
  setError,
  clearError,
}: ImageUploadFieldProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrl = useObjectUrl(field.value);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setError('Only PNG or JPG files are accepted.');
      e.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('File must be 5 MB or smaller.');
      e.target.value = '';
      return;
    }
    clearError();
    e.target.value = '';
    field.onChange(file);
  };

  const handleReplace = () => {
    field.onChange(undefined);
    fileInputRef.current?.click();
  };

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="sr-only"
        aria-label={`${label} file`}
        onChange={handleFileChange}
      />

      {field.value ? (
        <Attachment className="w-full">
          <AttachmentMedia variant="image">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt={previewAlt} />
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>{field.value.name}</AttachmentTitle>
            <AttachmentDescription>
              {formatFileSize(field.value.size)}
            </AttachmentDescription>
          </AttachmentContent>
          <AttachmentActions>
            <AttachmentAction
              aria-label={`Replace ${label}`}
              onClick={handleReplace}
            >
              <RefreshCwIcon aria-hidden="true" />
            </AttachmentAction>
          </AttachmentActions>
        </Attachment>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Attachment
            state="idle"
            orientation="vertical"
            className="w-full items-center p-6 text-center"
          >
            <AttachmentMedia>
              <CloudUploadIcon aria-hidden="true" />
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>Click to browse</AttachmentTitle>
              <AttachmentDescription>
                PNG or JPG · max 5 MB
              </AttachmentDescription>
            </AttachmentContent>
          </Attachment>
        </button>
      )}

      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
    </div>
  );
};
