import { AppSidebar } from '@/app/requester/_components/sidebar';
import { DashboardHeader } from '@/app/requester/_components/dashboard-header';
import { OfflineBanner } from '@/components/smartkey/offline-banner';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

export const metadata = { robots: { index: false, follow: false } };

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
