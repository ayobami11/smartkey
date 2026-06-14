'use client';

import * as React from 'react';
import {
  GalleryVerticalEnd,
  HistoryIcon,
  LayoutDashboardIcon,
  UserIcon,
} from 'lucide-react';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar';

import { useProfile } from '@/hooks/use-profile';

import { NavMain } from '@/app/requester/_components/sidebar-main';
import { SidebarBrand } from '@/app/requester/_components/sidebar-brand';
import { SidebarUser } from '@/app/requester/_components/sidebar-user';

const data = {
  team: {
    name: 'SmartKey',
    logo: GalleryVerticalEnd,
    plan: 'University of Lagos',
  },
  navMain: [
    {
      title: 'Dashboard',
      url: '/requester/dashboard',
      icon: LayoutDashboardIcon,
    },
    { title: 'History', url: '/requester/history', icon: HistoryIcon },
    { title: 'Profile', url: '/requester/profile', icon: UserIcon },
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
