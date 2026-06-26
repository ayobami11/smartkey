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
  '/cso/dashboard': 'Dashboard',
  '/cso/reports': 'Shift Reports',
  '/cso/users': 'Users',
  '/cso/audit': 'Audit Log',
  '/cso/keys': 'Key Inventory',
  '/cso/settings': 'Settings',
  '/cso/admin-keys': 'Administration Keys',
  '/cso/weekend-requests': 'Weekend Requests',
};

export const DashboardHeader = () => {
  const pathname = usePathname();
  const isHome = pathname === '/cso/dashboard';
  const isReportDetail = /^\/cso\/reports\/[^/]+$/.test(pathname);
  const isAdminKeyDetail = /^\/cso\/admin-keys\/[^/]+$/.test(pathname);
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
            {isReportDetail ? (
              <>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/cso/dashboard">
                    Dashboard
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/cso/reports">
                    Shift Reports
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Report Details</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            ) : isAdminKeyDetail ? (
              <>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/cso/dashboard">
                    Dashboard
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/cso/admin-keys">
                    Administration Keys
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Key Details</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            ) : isHome ? (
              <BreadcrumbItem>
                <BreadcrumbPage>Dashboard</BreadcrumbPage>
              </BreadcrumbItem>
            ) : (
              <>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/cso/dashboard">
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
        <DashboardHeaderAvatar settingsHref="/cso/settings" />
      </div>
    </header>
  );
};
