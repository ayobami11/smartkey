'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { ImageUploadField } from '@/components/smartkey/image-upload-field';
import {
  createImageUploadSchema,
  type ImageUploadInput,
} from '@/lib/validation/schemas';

const stampSchema = createImageUploadSchema(
  'Please upload an image containing your departmental stamp to continue.'
);

type StampUploadStepProps = {
  onNext: (file: File) => void;
  onBack: () => void;
  initialFile?: File;
};

export const StampUploadStep = ({
  onNext,
  onBack,
  initialFile,
}: StampUploadStepProps) => {
  const form = useForm<ImageUploadInput>({
    resolver: zodResolver(stampSchema),
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
          Upload your departmental stamp
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Stamp on white paper, scan or photograph, then upload.
        </p>
      </div>

      <Controller
        name="file"
        control={form.control}
        render={({ field, fieldState }) => (
          <ImageUploadField
            field={field}
            fieldState={fieldState}
            label="departmental stamp image"
            previewAlt="Stamp preview"
            setError={(message) => form.setError('file', { message })}
            clearError={() => form.clearErrors('file')}
          />
        )}
      />

      <div className="flex justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button type="submit">Continue</Button>
      </div>
    </form>
  );
};
