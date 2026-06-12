'use client';

import { useSyncExternalStore } from 'react';
import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';
import { useTheme } from 'next-themes';

import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

const emptySubscribe = () => () => {};

export const ModeToggle = () => {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  if (!mounted) {
    return (
      <div className="flex overflow-hidden rounded-md border border-input">
        <Skeleton className="h-9 w-9 rounded-none" />
        <Skeleton className="h-9 w-9 rounded-none border-x border-input" />
        <Skeleton className="h-9 w-9 rounded-none" />
      </div>
    );
  }

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      spacing={0}
      value={theme}
      onValueChange={(value) => {
        if (value) setTheme(value);
      }}
      aria-label="Colour theme"
    >
      <ToggleGroupItem value="system" aria-label="System theme">
        <MonitorIcon className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="light" aria-label="Light theme">
        <SunIcon className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="dark" aria-label="Dark theme">
        <MoonIcon className="size-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
};
