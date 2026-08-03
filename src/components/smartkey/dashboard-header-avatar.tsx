'use client';

import { useEffect, useState } from 'react';
import { LogOutIcon, SettingsIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';

const getInitials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

type DashboardHeaderAvatarProps = {
  settingsHref: string;
};

export const DashboardHeaderAvatar = ({
  settingsHref,
}: DashboardHeaderAvatarProps) => {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    fetch('/api/profile/me')
      .then((r) => r.json())
      .then((json) => {
        const p = json.data?.profile;
        if (p) {
          setName(p.full_name ?? '');
          setEmail(p.institutional_email ?? '');
          setPhotoUrl(p.photo_url ?? '');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handlePhotoUpdate = (e: Event) => {
      const { photoUrl: url } = (e as CustomEvent<{ photoUrl: string }>).detail;
      setPhotoUrl(url);
    };
    window.addEventListener('profile-photo-updated', handlePhotoUpdate);
    return () =>
      window.removeEventListener('profile-photo-updated', handlePhotoUpdate);
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  if (loading) {
    return <Skeleton className="size-8 rounded-full" />;
  }

  const initials = getInitials(name);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <Avatar className="size-8">
            <AvatarImage src={photoUrl} alt={name} />
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
              {initials || '?'}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-1 py-1.5">
            <Avatar className="size-8 shrink-0">
              <AvatarImage src={photoUrl} alt={name} />
              <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                {initials || '?'}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {email}
              </span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={settingsHref}>
            <SettingsIcon className="size-4" aria-hidden="true" />
            Settings
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          disabled={isLoggingOut}
          variant="destructive"
        >
          <LogOutIcon className="size-4" aria-hidden="true" />
          {isLoggingOut ? 'Signing out...' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
