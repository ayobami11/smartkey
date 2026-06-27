'use client';

import * as React from 'react';
import { useState } from 'react';
import {
  FileClockIcon,
  FileTextIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  SettingsIcon,
  UserRoundKeyIcon,
  UsersIcon,
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
    plan: 'CSO Dashboard',
  },
  navMain: [
    { title: 'Dashboard', url: '/cso/dashboard', icon: LayoutDashboardIcon },
    { title: 'Shift Reports', url: '/cso/reports', icon: FileTextIcon },
    { title: 'Users', url: '/cso/users', icon: UsersIcon },
    { title: 'Audit Log', url: '/cso/audit', icon: FileClockIcon },
    { title: 'Key Inventory', url: '/cso/keys', icon: KeyRoundIcon },
    {
      title: 'Admin Keys',
      url: '/cso/admin-keys',
      icon: UserRoundKeyIcon,
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
