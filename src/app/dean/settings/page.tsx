import { Suspense } from 'react';

import { SettingsSkeleton } from '@/components/smartkey/settings-skeleton';

import { SettingsView } from './_components/settings-view';

export const metadata = { title: 'Settings' };

export default function DeanSettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <SettingsView />
    </Suspense>
  );
}
