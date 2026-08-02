'use client';

import { useRef } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { CloudUploadIcon, RefreshCwIcon } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import {
  createImageUploadSchema,
  type ImageUploadInput,
} from '@/lib/validation/schemas';

const signatureSchema = createImageUploadSchema(
  'Please upload an image containing your signature to continue.'
);

type SignatureUploadStepProps = {
  onNext: (file: File) => void;
  initialFile?: File;
};

export const SignatureUploadStep = ({
  onNext,
  initialFile,
}: SignatureUploadStepProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<ImageUploadInput>({
    resolver: zodResolver(signatureSchema),
    defaultValues: { file: initialFile },
  });

  const handleSubmit = (data: ImageUploadInput) => {
    onNext(data.file as File);
  };

  return (
    <form
      onSubmit={form.handleSubmit(handleSubmit)}
      className="flex flex-col gap-6 rounded-lg border border-border bg-card p-6 shadow-[0_2px_4px_rgba(15,23,42,0.06)]"
    >
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Upload your signature
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign on a clean white sheet of paper, scan or photograph it, and
          upload the image. We&apos;ll use it to verify future approvals you
          sign.
        </p>
      </div>

      <Controller
        name="file"
        control={form.control}
        render={({ field, fieldState }) => (
          <div className="flex flex-col gap-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png"
              className="sr-only"
              aria-label="Signature image file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (!['image/jpeg', 'image/png'].includes(file.type)) {
                  form.setError('file', {
                    message: 'Only PNG or JPG files are accepted.',
                  });
                  e.target.value = '';
                  return;
                }
                if (file.size > 5 * 1024 * 1024) {
                  form.setError('file', {
                    message: 'File must be 5 MB or smaller.',
                  });
                  e.target.value = '';
                  return;
                }
                form.clearErrors('file');
                field.onChange(file);
              }}
            />

            {!(field.value instanceof File) ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border bg-muted/30 p-10 text-center transition-colors hover:border-primary/50 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <CloudUploadIcon
                  className="size-8 text-muted-foreground"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Click to browse
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    PNG or JPG · max 5 MB
                  </p>
                </div>
              </button>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex h-32 items-center justify-center overflow-hidden rounded-lg border border-border bg-white">
                  {/* Local blob: preview of an unsaved upload — next/image can't optimize it. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={URL.createObjectURL(field.value)}
                    alt="Signature preview"
                    className="max-h-full max-w-full object-contain p-2"
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  {field.value.name}
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="w-fit"
                  onClick={() => {
                    field.onChange(undefined);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                      fileInputRef.current.click();
                    }
                  }}
                >
                  <RefreshCwIcon className="size-3.5" aria-hidden="true" />
                  Replace
                </Button>
              </div>
            )}

            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </div>
        )}
      />

      <div className="flex justify-end">
        <Button type="submit">Continue</Button>
      </div>
    </form>
  );
};
