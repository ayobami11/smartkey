import Link from 'next/link';

import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

import { GuestWeekendRequestForm } from './_components/guest-weekend-request-form';

export const metadata = {
  title: 'Weekend Access Request',
  description: 'Request weekend building access at the UNILAG Senate Building.',
};

// Departments are world-readable, but a guest has no session, so we read them
// server-side with the service-role admin client (server-only) and pass the
// list to the client form. The service key never reaches the browser.

type DepartmentOption = { id: string; name: string };

const loadDepartments = async (): Promise<DepartmentOption[]> => {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('departments')
      .select('id, name')
      .order('name', { ascending: true });
    if (error) {
      logger.error('weekend-access departments query failed', {
        err: error.message,
      });
      return [];
    }
    return data ?? [];
  } catch (error) {
    logger.error('weekend-access departments load threw', {
      err: error instanceof Error ? error.message : 'unknown',
    });
    return [];
  }
};

export default async function WeekendAccessPage() {
  const departments = await loadDepartments();

  return (
    <main className="flex min-h-screen flex-col items-center bg-background px-4 py-12">
      {/* Brand header */}
      <div className="mb-8 text-center">
        <Link
          href="/"
          className="font-display text-3xl font-semibold tracking-tight text-primary underline-offset-4 hover:underline"
        >
          SmartKey
        </Link>
        <p className="mt-1 text-sm text-muted-foreground">
          University of Lagos Senate Building
        </p>
      </div>

      <div className="w-full max-w-lg">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">
            Request weekend key access
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            No SmartKey account needed. Upload your HOD&apos;s authorisation
            letter — once approved, you&apos;ll get a 6-digit code to collect
            the key on the day.
          </p>
        </div>

        <GuestWeekendRequestForm departments={departments} />

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have a SmartKey account?{' '}
          <Link
            href="/login"
            className="text-primary underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
