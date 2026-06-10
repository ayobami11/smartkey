import { AppSidebar } from './_components/sidebar';
import { DashboardHeader } from './_components/dashboard-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { OfflineBanner } from '@/components/smartkey/OfflineBanner';

export default function VerifierLayout({
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
