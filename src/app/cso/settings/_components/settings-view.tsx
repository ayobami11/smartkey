'use client';

import { useSyncExternalStore } from 'react';

import { parseAsStringLiteral, useQueryState } from 'nuqs';

import { useMediaQuery } from '@/hooks/use-media-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { AccountSettings } from '@/app/cso/settings/_components/account-settings';
import { NotificationSettings } from '@/app/cso/settings/_components/notification-settings';
import { OperationalSettings } from '@/app/cso/settings/_components/operational-settings';
import { RiskRulesSettings } from '@/app/cso/settings/_components/risk-rules-settings';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

type Section = 'operational' | 'risk' | 'notifications' | 'account';

const navSections: { id: Section; label: string }[] = [
  { id: 'operational', label: 'Operational' },
  { id: 'risk', label: 'Risk rules' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'account', label: 'Account' },
];

// Never notifies — "mounted" doesn't change after hydration, so there is
// nothing to subscribe to. useSyncExternalStore is the React-recommended,
// lint-clean way to render the server snapshot on the first pass and the
// client snapshot immediately after hydration, without a setState call
// inside a mount effect.
const emptySubscribe = () => () => {};

export const SettingsView = () => {
  const [active, setActive] = useQueryState(
    'tab',
    parseAsStringLiteral(navSections.map((s) => s.id)).withDefault(
      'operational'
    )
  );
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  // The real <Tabs> root switches flex-col/row based on the `orientation`
  // prop, which depends on `isDesktop` — unknown until after mount. Until
  // then, render a plain CSS-breakpoint-driven skeleton (flex-col
  // lg:flex-row) matching the same shape: the browser resolves that layout
  // at first paint with no JS involved, so it never has to jump from the
  // mobile (stacked) to desktop (side-by-side) arrangement the way the
  // JS-orientation-driven real layout would if rendered before `isDesktop`
  // settles.
  if (!mounted) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 pt-0 lg:flex-row lg:gap-8">
        <div
          className="flex gap-2 lg:w-48 lg:shrink-0 lg:flex-col"
          aria-hidden="true"
        >
          {navSections.map((s) => (
            <Skeleton
              key={s.id}
              className="h-9 flex-1 rounded-md lg:w-full lg:flex-none"
            />
          ))}
        </div>
        <Separator orientation="vertical" className="hidden lg:block" />
        <div className="flex flex-1 flex-col gap-6" aria-hidden="true">
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <Tabs
      value={active}
      onValueChange={(value) => setActive(value as Section)}
      orientation={isDesktop ? 'vertical' : 'horizontal'}
      className="flex-1 gap-6 p-4 pt-0 lg:gap-8"
    >
      <TabsList
        variant="line"
        aria-label="Settings sections"
        className="lg:w-48 lg:shrink-0"
      >
        {navSections.map((s) => (
          <TabsTrigger
            key={s.id}
            value={s.id}
            className="px-4 py-2 data-active:text-primary! lg:data-active:bg-primary/10! after:bg-primary lg:after:hidden"
          >
            {s.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <Separator orientation="vertical" className="hidden lg:block" />
      <div className="flex flex-1 flex-col gap-6">
        <TabsContent value="operational">
          <OperationalSettings />
        </TabsContent>
        <TabsContent value="risk">
          <RiskRulesSettings />
        </TabsContent>
        <TabsContent value="notifications">
          <NotificationSettings />
        </TabsContent>
        <TabsContent value="account">
          <AccountSettings />
        </TabsContent>
      </div>
    </Tabs>
  );
};
