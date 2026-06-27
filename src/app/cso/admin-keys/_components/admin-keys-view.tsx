'use client';

import { useQuery } from '@tanstack/react-query';
import { KeyRoundIcon, PlusIcon } from 'lucide-react';
import Link from 'next/link';

import { createBrowserClient } from '@/lib/supabase/client';
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
        {keys.map((key) => (
          <div
            key={key.id}
            className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5"
          >
            <div className="flex items-center gap-2.5">
              <KeyRoundIcon className="size-5 text-primary" />
              <div>
                <code className="font-mono font-semibold">{key.code}</code>
                <p className="text-sm text-muted-foreground">{key.room_name}</p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                Collectors ({key.authorisations.length}/3)
              </p>
              {key.authorisations.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  No collectors assigned
                </p>
              ) : (
                key.authorisations.map((auth) => (
                  <div
                    key={auth.profile_id}
                    className="text-xs text-foreground"
                  >
                    {auth.profile.full_name}
                  </div>
                ))
              )}
            </div>

            <Button variant="outline" size="sm" asChild>
              <Link href={`/cso/admin-keys/${key.id}`}>
                <PlusIcon className="size-4" />
                Manage Collectors
              </Link>
            </Button>
          </div>
        ))}
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
