'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircleIcon, KeyRoundIcon } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { createBrowserClient } from '@/lib/supabase/client';

type DeptKey = {
  id: string;
  code: string;
  room: string;
  zone: string;
  slots: boolean[];
};

type Props = { deptId: string | null };

const KeyGrid = ({ keys }: { keys: DeptKey[] }) => (
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
    {keys.map((key) => {
      const filledCount = key.slots.filter(Boolean).length;
      const allVacant = filledCount === 0;
      return (
        <Link
          key={key.id}
          href={`/dean/keys/${key.id}`}
          className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-[0_2px_4px_rgba(15,23,42,0.06)] transition-shadow hover:shadow-[0_4px_8px_rgba(15,23,42,0.08)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div
                className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${allVacant ? 'bg-amber-500/10' : 'bg-primary/10'}`}
              >
                <KeyRoundIcon
                  className={`size-4 ${allVacant ? 'text-amber-500' : 'text-primary'}`}
                  aria-hidden="true"
                />
              </div>
              <code className="font-mono text-sm font-semibold text-foreground">
                {key.code}
              </code>
            </div>
            {allVacant && (
              <AlertCircleIcon
                className="size-4 shrink-0 text-amber-500"
                aria-label="No collectors authorised"
              />
            )}
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">
              {key.room}
            </span>
            <span className="text-xs text-muted-foreground">{key.zone}</span>
          </div>

          <div className="flex items-center gap-2">
            <div
              className="flex items-center gap-1"
              aria-label={`${filledCount} of 3 collectors authorised`}
            >
              {key.slots.map((filled, i) => (
                <div
                  key={i}
                  className={`size-2.5 rounded-full ${
                    filled
                      ? 'bg-primary'
                      : 'border-2 border-dashed border-border'
                  }`}
                  aria-hidden="true"
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              {filledCount}/3 authorised
            </span>
          </div>
        </Link>
      );
    })}
  </div>
);

export const DepartmentKeys = ({ deptId }: Props) => {
  const [deptKeys, setDeptKeys] = useState<DeptKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);

  useEffect(() => {
    if (!deptId) {
      const timer = setTimeout(() => {
        setLoadingKeys(false);
        setDeptKeys([]);
      }, 0);
      return () => clearTimeout(timer);
    }

    const fetchKeys = async () => {
      setLoadingKeys(true);
      const supabase = createBrowserClient();
      const { data } = await supabase
        .from('keys')
        .select('id, code, zone, room_name, authorisations(profile_id)')
        .eq('unit_id', deptId)
        .order('code', { ascending: true });

      setDeptKeys(
        (data ?? []).map((k: Record<string, unknown>) => {
          const auths = k.authorisations as Array<{
            profile_id: string;
          }> | null;
          const filledCount = auths?.length ?? 0;
          return {
            id: k.id as string,
            code: k.code as string,
            room: k.room_name as string,
            zone:
              (k.zone as string) === 'NEW_SENATE' ? 'New Senate' : 'Old Senate',
            slots: Array(3)
              .fill(false)
              .map((_, i) => i < filledCount) as boolean[],
          };
        })
      );
      setLoadingKeys(false);
    };

    fetchKeys();
  }, [deptId]);

  if (loadingKeys) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 rounded-lg" />
        ))}
      </div>
    );
  }

  if (deptKeys.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-border bg-card p-12 text-center">
        <p className="text-sm text-muted-foreground">
          No keys assigned to your department yet. Contact the CSO.
        </p>
      </div>
    );
  }

  return <KeyGrid keys={deptKeys} />;
};
