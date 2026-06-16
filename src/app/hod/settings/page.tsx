'use client';

import { useState } from 'react';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { AccountSettings } from '@/app/hod/settings/_components/account-settings';
import { NotificationSettings } from '@/app/hod/settings/_components/notification-settings';
import { SignatureAndStampSettings } from '@/app/hod/settings/_components/signature-and-stamp-settings';

type Section = 'account' | 'signature' | 'notifications';

const navItems: { id: Section; label: string }[] = [
  { id: 'account', label: 'Account' },
  { id: 'signature', label: 'Signature & stamp' },
  { id: 'notifications', label: 'Notifications' },
];

export default function HodSettingsPage() {
  const [active, setActive] = useState<Section>('account');
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      <Tabs
        value={active}
        onValueChange={(value) => setActive(value as Section)}
        orientation={isDesktop ? 'vertical' : 'horizontal'}
        className="flex-1 gap-6 lg:gap-8"
      >
        <TabsList
          variant="line"
          aria-label="Settings sections"
          className="lg:w-48 lg:shrink-0"
        >
          {navItems.map((s) => (
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
          <TabsContent value="account">
            <AccountSettings />
          </TabsContent>
          <TabsContent value="signature">
            <SignatureAndStampSettings />
          </TabsContent>
          <TabsContent value="notifications">
            <NotificationSettings />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
