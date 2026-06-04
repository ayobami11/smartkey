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
import { ModeToggle } from '@/components/smartkey/ModeToggle';

const ROUTES: Record<string, string> = {
  '/cso/dashboard': 'Dashboard',
  '/cso/reports': 'Shift Reports',
  '/cso/users': 'Users',
  '/cso/audit': 'Audit Log',
  '/cso/keys': 'Key Inventory',
  '/cso/settings': 'Settings',
};

export const DashboardHeader = () => {
  const pathname = usePathname();
  const isHome = pathname === '/cso/dashboard';
  const pageTitle = ROUTES[pathname] ?? 'Dashboard';

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
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
      <div className="ml-auto px-4">
        <ModeToggle />
      </div>
    </header>
  );
};
