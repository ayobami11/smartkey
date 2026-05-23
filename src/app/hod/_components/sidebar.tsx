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

import { NavMain } from './sidebar-main';
import { SidebarBrand } from './sidebar-brand';
import { SidebarUser } from './sidebar-user';

const data = {
  user: {
    name: 'Prof. Okonkwo',
    email: 'o.okonkwo@unilag.edu.ng',
    avatar: '',
  },
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
