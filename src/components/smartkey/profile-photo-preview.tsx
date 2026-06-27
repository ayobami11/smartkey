'use client';

import { useState } from 'react';
import { UserIcon } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const getInitials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

type ProfilePhotoPreviewProps = {
  name: string;
  photoUrl?: string;
  avatarClassName?: string;
  loading?: boolean;
};

export const ProfilePhotoPreview = ({
  name,
  photoUrl,
  avatarClassName,
  loading = false,
}: ProfilePhotoPreviewProps) => {
  const [open, setOpen] = useState(false);

  const initials = getInitials(name);
  const hasPhoto = Boolean(photoUrl);

  return (
    <>
      <button
        type="button"
        onClick={() => hasPhoto && setOpen(true)}
        disabled={!hasPhoto}
        aria-label={hasPhoto ? `View ${name}'s profile photo` : undefined}
        className="cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-default"
      >
        <Avatar className={avatarClassName}>
          <AvatarImage src={photoUrl} alt={name} />
          <AvatarFallback className="bg-primary/10 font-semibold text-primary text-3xl">
            {loading ? (
              '...'
            ) : initials ? (
              initials
            ) : (
              <UserIcon className="size-4" aria-hidden="true" />
            )}
          </AvatarFallback>
        </Avatar>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm p-4">
          <DialogHeader>
            <DialogTitle>{name}</DialogTitle>
          </DialogHeader>
          {photoUrl && (
            // Regular <img> intentionally — photoUrl may be a blob: URL (pending
            // preview) which next/image cannot handle, and optimization is
            // unnecessary for a modal preview of an already-loaded image.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt={`${name}'s profile photo`}
              className="aspect-square w-full rounded-lg object-cover bg-muted"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
