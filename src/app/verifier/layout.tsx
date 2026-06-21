import { AppSidebar } from '@/app/verifier/_components/sidebar';
import { DashboardHeader } from '@/app/verifier/_components/dashboard-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { OfflineBanner } from '@/components/smartkey/offline-banner';

export const metadata = { robots: { index: false, follow: false } };

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
