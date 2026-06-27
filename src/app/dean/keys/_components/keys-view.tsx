'use client';

import { useEffect, useState } from 'react';

import { createBrowserClient } from '@/lib/supabase/client';
import { DepartmentKeys } from '@/app/dean/dashboard/_components/department-keys';

export const KeysView = () => {
  const [deptId, setDeptId] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('unit_id')
        .eq('id', user.id)
        .single();

      if (profile) {
        setDeptId((profile.unit_id as string | null) ?? null);
      }
    };

    init();
  }, []);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Unit keys</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Manage authorised collectors for each key.
        </p>
      </div>
      <DepartmentKeys deptId={deptId} />
    </div>
  );
};
