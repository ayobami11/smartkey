'use client';

import { useEffect, useState } from 'react';

import { createBrowserClient } from '@/lib/supabase/client';

import { WeekendRequests } from '@/app/hod/dashboard/_components/weekend-requests';

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

export default function HodDashboardPage() {
  const [fullName, setFullName] = useState('');
  const [deptName, setDeptName] = useState('');

  useEffect(() => {
    const init = async () => {
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select(
          'full_name, department_id, department:departments!department_id(name)'
        )
        .eq('id', user.id)
        .single();

      if (profile) {
        setFullName((profile.full_name as string | null) ?? '');
        const dept = profile.department as { name: string } | null;
        setDeptName(dept?.name ?? '');
      }
    };

    init();
  }, []);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          {getGreeting()}
          {fullName ? `, ${fullName}` : ''}.
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {deptName || 'Loading…'}
        </p>
      </div>

      <WeekendRequests />
    </div>
  );
}
