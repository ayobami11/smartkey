import React from 'react';

import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

import { DashboardHeader } from '@/app/hod/_components/dashboard-header';
import { AppSidebar } from '@/app/hod/_components/sidebar';

export default function HodLayout({ children }: { children: React.ReactNode }) {
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
