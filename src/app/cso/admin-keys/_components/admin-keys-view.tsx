'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertCircleIcon, KeyRoundIcon } from 'lucide-react';
import Link from 'next/link';

import { createBrowserClient } from '@/lib/supabase/client';
import { ZONE_LABELS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

type AdminKey = {
  id: string;
  code: string;
  room_name: string;
  zone: string;
  authorisations: Array<{
    profile_id: string;
    profile: { full_name: string; institutional_email: string };
  }>;
};

export const AdminKeysView = () => {
  const {
    data: keys = [],
    isLoading,
    error,
  } = useQuery<AdminKey[]>({
    queryKey: ['cso', 'admin-keys'],
    queryFn: async () => {
      const supabase = createBrowserClient();
      const { data, error } = await supabase
        .from('keys')
        .select(
          `id, code, room_name, zone,
           department:units!unit_id(authoriser),
           authorisations(profile_id, profile:profiles!profile_id(full_name, institutional_email))`
        )
        .order('code');

      if (error) throw new Error('Failed to load administration keys');

      return (data ?? [])
        .filter(
          (k) =>
            k.department &&
            (k.department as unknown as { authoriser: string }).authoriser ===
              'CSO'
        )
        .map((k) => ({
          ...k,
          authorisations: k.authorisations || [],
        }));
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">{(error as Error).message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Administration Keys
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage collectors for central Senate office keys.
          </p>
        </div>
        <Button asChild>
          <Link href="/cso/weekend-requests">Weekend Requests</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {keys.map((key) => {
          const allVacant = key.authorisations.length === 0;
          const filledCount = key.authorisations.length;
          return (
            <Link
              key={key.id}
              href={`/cso/admin-keys/${key.id}`}
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
                  {key.room_name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {ZONE_LABELS[key.zone as keyof typeof ZONE_LABELS] ??
                    key.zone}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div
                  className="flex items-center gap-1"
                  aria-label={`${filledCount} of 3 collectors authorised`}
                >
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className={`size-2.5 rounded-full ${i < filledCount ? 'bg-primary' : 'border-2 border-dashed border-border'}`}
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

      {keys.length === 0 && (
        <div className="rounded-lg border border-border bg-muted/30 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No administration keys found.
          </p>
        </div>
      )}
    </div>
  );
};
