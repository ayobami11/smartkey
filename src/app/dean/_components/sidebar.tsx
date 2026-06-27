'use client';

import * as React from 'react';
import { useState } from 'react';
import {
  CalendarClockIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  SettingsIcon,
} from 'lucide-react';

import { SmartKeyMark } from '@/components/smartkey/smart-key-mark';
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

import { apiFetch } from '@/lib/api';
import { NavMain } from '@/components/smartkey/sidebar-nav';
import { SidebarBrand } from '@/components/smartkey/sidebar-brand';

const data = {
  team: {
    name: 'SmartKey',
    logo: SmartKeyMark,
    plan: 'Dean Dashboard',
  },
  navMain: [
    { title: 'Dashboard', url: '/dean/dashboard', icon: LayoutDashboardIcon },
    { title: 'Key Inventory', url: '/dean/keys', icon: KeyRoundIcon },
    {
      title: 'Weekend Requests',
      url: '/dean/weekend-requests',
      icon: CalendarClockIcon,
    },
    { title: 'Settings', url: '/dean/settings', icon: SettingsIcon },
  ],
};

export const AppSidebar = ({
  ...props
}: React.ComponentProps<typeof Sidebar>) => {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await apiFetch('/api/auth/logout', { method: 'POST' });
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
              <span>{isLoggingOut ? 'Signing out...' : 'Sign out'}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
};
