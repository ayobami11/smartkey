import { AppSidebar } from './_components/sidebar';
import { DashboardHeader } from './_components/dashboard-header';
import { OfflineBanner } from '@/components/smartkey/offline-banner';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

export default function RequesterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <DashboardHeader />
        <OfflineBanner />
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
