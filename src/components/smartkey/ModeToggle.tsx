'use client';

import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';
import { useTheme } from 'next-themes';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export const ModeToggle = () => {
  const { theme, setTheme } = useTheme();

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
