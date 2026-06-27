'use client';

import * as React from 'react';
import { useState } from 'react';
import {
  ArrowLeftRightIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  SirenIcon,
} from 'lucide-react';

import { SmartKeyMark } from '@/components/smartkey/SmartKeyMark';
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

import { NavMain } from '@/app/verifier/_components/sidebar-main';
import { SidebarBrand } from '@/app/verifier/_components/sidebar-brand';

const data = {
  team: {
    name: 'SmartKey',
    logo: SmartKeyMark,
    plan: 'University of Lagos',
  },
  navMain: [
    {
      title: 'Dashboard',
      url: '/verifier/dashboard',
      icon: LayoutDashboardIcon,
    },
    { title: 'Handover', url: '/verifier/handover', icon: ArrowLeftRightIcon },
    { title: 'Incidents', url: '/verifier/incidents', icon: SirenIcon },
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
              <span>{isLoggingOut ? 'Signing out...' : 'Sign out'}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
};
