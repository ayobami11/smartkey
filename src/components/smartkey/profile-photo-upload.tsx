'use client';

import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { Trash2Icon, UploadIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

import { ProfilePhotoPreview } from '@/components/smartkey/profile-photo-preview';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ProfilePhotoUploadSkeleton } from '@/components/smartkey/profile-photo-upload-skeleton';
import { Button } from '@/components/ui/button';

const photoSchema = z
  .instanceof(File)
  .refine((f) => f.type.startsWith('image/'), 'File must be an image.')
  .refine((f) => f.size <= 2 * 1024 * 1024, 'Photo must be under 2 MB.');

type ProfilePhotoUploadProps = {
  name: string;
  loading?: boolean;
  initialUrl?: string;
};

// Avatar + "Upload photo" control shared by every role's account settings.
// Uploads to POST /api/profile/photo on explicit save, not on file selection.
export const ProfilePhotoUpload = ({
  name,
  loading = false,
  initialUrl = '',
}: ProfilePhotoUploadProps) => {
  const [photoUrl, setPhotoUrl] = useState(initialUrl);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  // Managed manually so we control exactly when the blob URL is revoked.
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep in sync with the parent's async profile fetch.
  useEffect(() => {
    setPhotoUrl(initialUrl);
  }, [initialUrl]);

  const handleSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so selecting the same file again still fires onChange.
    e.target.value = '';
    if (!file) return;

    const validation = photoSchema.safeParse(file);
    if (!validation.success) {
      setError(validation.error.issues[0]?.message ?? 'Invalid file.');
      return;
    }

    // Revoke any previous blob before creating a new one.
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);

    setError(null);
    setPendingFile(file);
    setPendingPreview(URL.createObjectURL(file));
  };

  const handleCancel = () => {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview(null);
    setError(null);
  };

  const handleRemove = async () => {
    setRemoving(true);
    setError(null);
    try {
      const res = await fetch('/api/profile/photo', { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to remove photo.');
        toast.error(json.error ?? 'Failed to remove photo.');
        return;
      }
      setPhotoUrl('');
      window.dispatchEvent(
        new CustomEvent('profile-photo-updated', { detail: { photoUrl: '' } })
      );
      toast.success('Profile photo removed successfully.');
    } catch {
      setError('Something went wrong. Check your connection.');
      toast.error('Something went wrong. Check your connection.');
    } finally {
      setRemoving(false);
    }
  };

  const handleSave = async () => {
    if (!pendingFile) return;

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('photo', pendingFile);
      const res = await fetch('/api/profile/photo', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Upload failed.');
        toast.error(json.error ?? 'Upload failed.');
        return;
      }

      // Cache-bust so the new image (same storage path) shows immediately.
      const newUrl = `${json.data.photo_url}?t=${Date.now()}`;
      const blobUrl = pendingPreview;

      setPhotoUrl(newUrl);
      setPendingFile(null);
      window.dispatchEvent(
        new CustomEvent('profile-photo-updated', {
          detail: { photoUrl: newUrl },
        })
      );

      // Keep the blob URL alive until the new server image has loaded so the
      // avatar never flashes back to initials during the network round-trip.
      const img = new window.Image();
      const cleanup = () => {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        setPendingPreview(null);
      };
      img.onload = cleanup;
      img.onerror = cleanup;
      img.src = newUrl;
      toast.success('Profile photo updated successfully.');
    } catch {
      setError('Something went wrong. Check your connection.');
      toast.error('Something went wrong. Check your connection.');
    } finally {
      setUploading(false);
    }
  };

  const displayUrl = pendingPreview ?? photoUrl;

  if (loading) return <ProfilePhotoUploadSkeleton />;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-4">
        <ProfilePhotoPreview
          name={name}
          photoUrl={displayUrl || undefined}
          avatarClassName="size-20 shrink-0 text-xl"
        />

        {pendingFile ? (
          <div className="flex flex-col gap-2">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={uploading}
              aria-busy={uploading}
            >
              <UploadIcon className="size-3.5" aria-hidden="true" />
              {uploading ? 'Saving…' : 'Save photo'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              disabled={uploading}
              aria-label="Cancel photo selection"
            >
              <XIcon className="size-3.5" aria-hidden="true" />
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={removing}
            >
              <UploadIcon className="size-3.5" aria-hidden="true" />
              Upload photo
            </Button>
            {photoUrl && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={removing}
                    aria-busy={removing}
                  >
                    <Trash2Icon className="size-3.5" aria-hidden="true" />
                    {removing ? 'Removing…' : 'Remove photo'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove profile photo?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Your profile photo will be deleted. Your initials will be
                      shown instead.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleRemove}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Remove
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        )}

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
