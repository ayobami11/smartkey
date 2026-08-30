import React from 'react';

import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

export const metadata = { robots: { index: false, follow: false } };

import { DashboardHeader } from '@/app/dean/_components/dashboard-header';
import { AppSidebar } from '@/app/dean/_components/sidebar';

export default function DeanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <DashboardHeader />
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
