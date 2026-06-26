'use client';

import { usePathname } from 'next/navigation';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { DashboardHeaderAvatar } from '@/components/smartkey/dashboard-header-avatar';
import { ModeToggle } from '@/components/smartkey/mode-toggle';

const ROUTES: Record<string, string> = {
  '/dean/keys': 'Key Inventory',
  '/dean/weekend-requests': 'Weekend Requests',
  '/dean/onboarding': 'Setup',
  '/dean/settings': 'Settings',
};

export const DashboardHeader = () => {
  const pathname = usePathname();
  const isHome = pathname === '/dean/dashboard';
  const isKeyDetail = /^\/dean\/keys\/[^/]+$/.test(pathname);
  const pageTitle = ROUTES[pathname] ?? 'Dashboard';

  return (
    <header className="flex h-18 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-13 border-b border-border mb-6">
      <div className="flex items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <div>
          <Separator
            orientation="vertical"
            className="mr-2 data-[orientation=vertical]:h-4"
          />
        </div>
        <Breadcrumb>
          <BreadcrumbList>
            {isKeyDetail ? (
              <>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/dean/dashboard">
                    Dashboard
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/dean/keys">
                    Key Inventory
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Key Slot Management</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            ) : isHome ? (
              <BreadcrumbItem>
                <BreadcrumbPage>Dashboard</BreadcrumbPage>
              </BreadcrumbItem>
            ) : (
              <>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/dean/dashboard">
                    Dashboard
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="ml-auto flex items-center gap-4 px-4">
        <ModeToggle />
        <DashboardHeaderAvatar settingsHref="/dean/settings" />
      </div>
    </header>
  );
};
