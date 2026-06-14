'use client';

import * as React from 'react';
import {
  CalendarClockIcon,
  GalleryVerticalEnd,
  LayoutDashboardIcon,
  UserCircleIcon,
} from 'lucide-react';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar';

import { useProfile } from '@/hooks/use-profile';

import { NavMain } from '@/app/hod/_components/sidebar-main';
import { SidebarBrand } from '@/app/hod/_components/sidebar-brand';
import { SidebarUser } from '@/app/hod/_components/sidebar-user';

const data = {
  team: {
    name: 'SmartKey',
    logo: GalleryVerticalEnd,
    plan: 'University of Lagos',
  },
  navMain: [
    { title: 'Dashboard', url: '/hod/dashboard', icon: LayoutDashboardIcon },
    {
      title: 'Weekend Requests',
      url: '/hod/weekend-requests',
      icon: CalendarClockIcon,
    },
    { title: 'Profile', url: '/hod/profile', icon: UserCircleIcon },
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
