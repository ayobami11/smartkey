'use client';

import { useState } from 'react';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { AccountSettings } from '@/app/cso/settings/_components/account-settings';
import { NotificationSettings } from '@/app/cso/settings/_components/notification-settings';
import { OperationalSettings } from '@/app/cso/settings/_components/operational-settings';
import { RiskRulesSettings } from '@/app/cso/settings/_components/risk-rules-settings';
import { Separator } from '@/components/ui/separator';

type Section = 'operational' | 'risk' | 'notifications' | 'account';

const navSections: { id: Section; label: string }[] = [
  { id: 'operational', label: 'Operational' },
  { id: 'risk', label: 'Risk rules' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'account', label: 'Account' },
];

export default function SettingsPage() {
  const [active, setActive] = useState<Section>('operational');
  const isDesktop = useMediaQuery('(min-width: 1024px)');

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
            className="data-active:text-primary after:bg-primary"
          >
            {s.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {/* Section content */}
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
}
