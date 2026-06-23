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
  '/requester/dashboard': 'Dashboard',
  '/requester/history': 'History',
  '/requester/settings': 'Settings',
};

const DYNAMIC_ROUTES: Array<{ pattern: RegExp; title: string }> = [
  { pattern: /^\/requester\/request\/[^/]+\/code$/, title: 'Collection Code' },
];

const getPageTitle = (pathname: string): string =>
  ROUTES[pathname] ??
  DYNAMIC_ROUTES.find(({ pattern }) => pattern.test(pathname))?.title ??
  'Dashboard';

export const DashboardHeader = () => {
  const pathname = usePathname();
  const isHome = pathname === '/requester/dashboard';
  const pageTitle = getPageTitle(pathname);

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
            {isHome ? (
              <BreadcrumbItem>
                <BreadcrumbPage>Dashboard</BreadcrumbPage>
              </BreadcrumbItem>
            ) : (
              <>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/requester/dashboard">
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
        <DashboardHeaderAvatar settingsHref="/requester/settings" />
      </div>
    </header>
  );
};
