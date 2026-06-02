'use client';

import * as React from 'react';
import {
  ArrowLeftRightIcon,
  CornerDownLeftIcon,
  GalleryVerticalEnd,
  KeyRoundIcon,
  LayoutDashboardIcon,
  SirenIcon,
} from 'lucide-react';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar';

import { useProfile } from '@/hooks/use-profile';

import { NavMain } from './sidebar-main';
import { SidebarBrand } from './sidebar-brand';
import { SidebarUser } from './sidebar-user';

const data = {
  team: {
    name: 'SmartKey',
    logo: GalleryVerticalEnd,
    plan: 'University of Lagos',
  },
  navMain: [
    {
      title: 'Dashboard',
      url: '/verifier/dashboard',
      icon: LayoutDashboardIcon,
    },
    { title: 'Issue Key', url: '/verifier/issue', icon: KeyRoundIcon },
    { title: 'Return Key', url: '/verifier/return', icon: CornerDownLeftIcon },
    { title: 'Handover', url: '/verifier/handover', icon: ArrowLeftRightIcon },
    { title: 'Incidents', url: '/verifier/incidents', icon: SirenIcon },
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
