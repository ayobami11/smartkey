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

import { NavMain } from './sidebar-main';
import { SidebarUser } from './sidebar-user';
import { SidebarBrand } from './sidebar-brand';

const data = {
  user: {
    name: 'Chief Security Officer',
    email: 'cso@unilag.edu.ng',
    avatar: '',
  },
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
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarBrand team={data.team} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
};
