'use client';

import * as React from 'react';
import {
  FileClockIcon,
  FileTextIcon,
  GalleryVerticalEnd,
  KeyRoundIcon,
  LayoutDashboardIcon,
  SettingsIcon,
  UsersIcon,
} from 'lucide-react';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar';

import { useProfile } from '@/hooks/use-profile';

import { NavMain } from '@/app/cso/_components/sidebar-main';
import { SidebarBrand } from '@/app/cso/_components/sidebar-brand';
import { SidebarUser } from '@/app/cso/_components/sidebar-user';

const data = {
  team: {
    name: 'SmartKey',
    logo: GalleryVerticalEnd,
    plan: 'University of Lagos',
  },
  navMain: [
    { title: 'Dashboard', url: '/cso/dashboard', icon: LayoutDashboardIcon },
    { title: 'Shift Reports', url: '/cso/reports', icon: FileTextIcon },
    { title: 'Users', url: '/cso/users', icon: UsersIcon },
    { title: 'Audit Log', url: '/cso/audit', icon: FileClockIcon },
    { title: 'Key Inventory', url: '/cso/keys', icon: KeyRoundIcon },
    { title: 'Settings', url: '/cso/settings', icon: SettingsIcon },
  ],
};

export const AppSidebar = ({
  ...props
}: React.ComponentProps<typeof Sidebar>) => {
  const user = useProfile();
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarBrand team={data.team} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
};
