'use client';

import * as React from 'react';
import { useState } from 'react';
import {
  CalendarCheckIcon,
  FileClockIcon,
  FileTextIcon,
  GalleryVerticalEnd,
  KeyRoundIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  SettingsIcon,
  UsersIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';

import { NavMain } from '@/app/cso/_components/sidebar-main';
import { SidebarBrand } from '@/app/cso/_components/sidebar-brand';

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
    {
      title: 'Administration Keys',
      url: '/cso/admin-keys',
      icon: KeyRoundIcon,
    },
    {
      title: 'Weekend Requests',
      url: '/cso/weekend-requests',
      icon: CalendarCheckIcon,
    },
    { title: 'Settings', url: '/cso/settings', icon: SettingsIcon },
  ],
};

export const AppSidebar = ({
  ...props
}: React.ComponentProps<typeof Sidebar>) => {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarBrand team={data.team} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleLogout}
              disabled={isLoggingOut}
              aria-busy={isLoggingOut}
              tooltip="Sign out"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOutIcon aria-hidden="true" />
              <span>{isLoggingOut ? 'Signing out…' : 'Sign out'}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
};
