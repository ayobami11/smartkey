'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useRealtime } from '@/hooks/use-realtime';
import { createBrowserClient } from '@/lib/supabase/client';
import { formatDate, formatTime } from '@/lib/dates';

import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SectionCardHeader } from '@/components/smartkey/section-card-header';

const QUERY_KEY = ['dean', 'collectors'];

type KeyGroup = {
  keyId: string;
  keyCode: string;
  roomName: string;
};

type CollectorRow = KeyGroup & {
  kind: 'collector';
  isFirstRow: boolean;
  rowSpanCount: number;
  full_name: string;
  institutional_email: string;
  authorised_at: string;
};

type SummaryRow = KeyGroup & {
  kind: 'summary';
  isFirstRow: boolean;
  rowSpanCount: number;
  unassignedCount: number;
};

type SlotRow = CollectorRow | SummaryRow;

export const CollectorsTable = () => {
  const queryClient = useQueryClient();

  useRealtime({
    table: 'authorisations',
    onInsert: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onUpdate: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onDelete: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const {
    data: rows = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<SlotRow[]> => {
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];

      const { data: profile } = await supabase
        .from('profiles')
        .select('unit_id')
        .eq('id', user.id)
        .single();
      const deptId = (profile?.unit_id as string | null) ?? null;
      if (!deptId) return [];

      const { data, error: queryError } = await supabase
        .from('keys')
        .select(
          'id, code, room_name, authorisations(profile_id, authorised_at, profiles:profile_id(full_name, institutional_email))'
        )
        .eq('unit_id', deptId)
        .order('code', { ascending: true });

      if (queryError) throw new Error('Failed to load collectors.');

      return (data ?? []).flatMap((key: Record<string, unknown>) => {
        const auths =
          (key.authorisations as Array<{
            profile_id: string;
            authorised_at: string;
            profiles: { full_name: string; institutional_email: string } | null;
          }> | null) ?? [];

        const group: KeyGroup = {
          keyId: key.id as string,
          keyCode: key.code as string,
          roomName: key.room_name as string,
        };

        const unassignedCount = Math.max(0, 3 - auths.length);
        const rowSpanCount = auths.length + (unassignedCount > 0 ? 1 : 0);

        const collectorRows: SlotRow[] = auths.map((a, i) => ({
          ...group,
          kind: 'collector',
          isFirstRow: i === 0,
          rowSpanCount,
          full_name: a.profiles?.full_name ?? '—',
          institutional_email: a.profiles?.institutional_email ?? '—',
          authorised_at: a.authorised_at,
        }));

        const summaryRow: SlotRow[] =
          unassignedCount > 0
            ? [
                {
                  ...group,
                  kind: 'summary',
                  isFirstRow: auths.length === 0,
                  rowSpanCount,
                  unassignedCount,
                },
              ]
            : [];

        return [...collectorRows, ...summaryRow];
      });
    },
  });

  const hasKeys = new Set(rows.map((r) => r.keyId)).size > 0;

  return (
    <div className="flex flex-col gap-4">
      <SectionCardHeader
        title="Authorised collectors"
        viewAllHref="/dean/keys"
      />

      {isLoading && (
        <div className="flex flex-col gap-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 rounded-md" />
          ))}
        </div>
      )}

      {!!error && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4"
          role="alert"
        >
          <p className="text-sm text-destructive">{(error as Error).message}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => refetch()}
          >
            Retry
          </Button>
        </div>
      )}

      {!isLoading && !error && !hasKeys && (
        <Empty className="border border-border bg-card">
          <EmptyContent>
            <EmptyTitle>No keys assigned to your faculty yet.</EmptyTitle>
            <EmptyDescription>Contact the CSO.</EmptyDescription>
          </EmptyContent>
        </Empty>
      )}

      {!isLoading && !error && hasKeys && (
        <div
          className="rounded-lg border border-border bg-card shadow-[0_2px_4px_rgba(15,23,42,0.06)]"
          aria-live="polite"
          aria-relevant="additions"
        >
          <Table>
            <TableCaption className="sr-only">
              Authorised collectors for each of your faculty&apos;s keys,
              including vacant slots.
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Date assigned</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, idx) => (
                <TableRow key={`${row.keyId}-${idx}`}>
                  {row.isFirstRow && (
                    <TableCell rowSpan={row.rowSpanCount} className="align-top">
                      <code className="font-mono text-sm text-foreground">
                        {row.keyCode}
                      </code>
                      <p className="text-xs text-muted-foreground">
                        {row.roomName}
                      </p>
                    </TableCell>
                  )}
                  {row.kind === 'collector' ? (
                    <>
                      <TableCell className="text-sm text-foreground">
                        {row.full_name}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <span
                          aria-label={`Date assigned: ${new Date(
                            row.authorised_at
                          ).toLocaleString()}`}
                        >
                          {formatDate(row.authorised_at)},{' '}
                          {formatTime(row.authorised_at)}
                        </span>
                      </TableCell>
                    </>
                  ) : (
                    <TableCell
                      colSpan={2}
                      className="text-sm text-muted-foreground italic"
                    >
                      {row.unassignedCount} slot
                      {row.unassignedCount === 1 ? '' : 's'} unassigned
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};
