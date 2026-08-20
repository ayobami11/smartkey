'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { ImageUploadField } from '@/components/smartkey/image-upload-field';
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
          <ImageUploadField
            field={field}
            fieldState={fieldState}
            label="signature image"
            previewAlt="Signature preview"
            setError={(message) => form.setError('file', { message })}
            clearError={() => form.clearErrors('file')}
          />
        )}
      />

      <div className="flex justify-end">
        <Button type="submit">Continue</Button>
      </div>
    </form>
  );
};
