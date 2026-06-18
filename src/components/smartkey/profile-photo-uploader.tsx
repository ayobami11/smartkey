'use client';

import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { UploadIcon } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

const getInitials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

type ProfilePhotoUploaderProps = {
  name: string;
  loading?: boolean;
  initialUrl?: string;
};

// Avatar + "Upload photo" control shared by every role's account settings.
// Uploads to POST /api/profile/photo, which stores the file and updates the
// profile's photo_url server-side.
export const ProfilePhotoUploader = ({
  name,
  loading = false,
  initialUrl = '',
}: ProfilePhotoUploaderProps) => {
  const [photoUrl, setPhotoUrl] = useState(initialUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep in sync with the parent's async profile fetch.
  useEffect(() => {
    setPhotoUrl(initialUrl);
  }, [initialUrl]);

  const handleSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so selecting the same file again still fires onChange.
    e.target.value = '';
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('photo', file);
      const res = await fetch('/api/profile/photo', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Upload failed.');
        return;
      }
      // Cache-bust so the new image (same storage path) shows immediately.
      setPhotoUrl(`${json.data.photo_url}?t=${Date.now()}`);
    } catch {
      setError('Something went wrong. Check your connection.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-4">
        <Avatar className="size-16 shrink-0">
          <AvatarImage src={photoUrl} alt={name} />
          <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
            {loading ? '…' : getInitials(name) || '?'}
          </AvatarFallback>
        </Avatar>
        <Button
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || loading}
          aria-busy={uploading}
        >
          <UploadIcon className="size-3.5" aria-hidden="true" />
          {uploading ? 'Uploading…' : 'Upload photo'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={handleSelect}
          aria-label="Upload profile photo"
        />
      </div>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};
