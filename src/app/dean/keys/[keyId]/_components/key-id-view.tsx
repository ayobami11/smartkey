'use client';

import { startTransition, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { KeyRoundIcon, PlusIcon, Trash2Icon, UserIcon } from 'lucide-react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api';
import { createBrowserClient } from '@/lib/supabase/client';
import { KeyHistory } from '@/app/cso/admin-keys/[keyId]/_components/key-history';

// Types

type FilledSlot = {
  filled: true;
  profile_id: string;
  name: string;
  email: string;
  authorisedAt: string;
};
type VacantSlot = { filled: false };
type Slot = FilledSlot | VacantSlot;

type Candidate = {
  id: string;
  full_name: string;
  institutional_email: string;
};

type KeyData = {
  id: string;
  code: string;
  zone: string;
  room_name: string;
  department: { name: string } | null;
};

// Component

export const KeyIdView = () => {
  const { keyId } = useParams<{ keyId: string }>();

  const [keyData, setKeyData] = useState<KeyData | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Add collector picker state
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Remove confirmation state
  const [removeTarget, setRemoveTarget] = useState<FilledSlot | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  useEffect(() => {
    if (!keyId) return;
    const init = async () => {
      const supabase = createBrowserClient();

      // Get HOD's department
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('unit_id')
        .eq('id', user.id)
        .single();

      const hodDeptId = (profile?.unit_id as string | null) ?? null;

      // Fetch key details
      const { data: key, error: keyErr } = await supabase
        .from('keys')
        .select('id, code, zone, room_name, department:units!unit_id(name)')
        .eq('id', keyId)
        .single();

      if (keyErr || !key) {
        setFetchError('Key not found.');
        setLoading(false);
        return;
      }

      setKeyData(key as unknown as KeyData);

      // Fetch current authorisations (slots)
      const { data: auths } = await supabase
        .from('authorisations')
        .select(
          'profile_id, authorised_at, profile:profiles!profile_id(full_name, institutional_email)'
        )
        .eq('key_id', keyId);

      const filledSlots: FilledSlot[] = (auths ?? []).map(
        (a: Record<string, unknown>) => {
          const p = a.profile as {
            full_name: string;
            institutional_email: string;
          } | null;
          return {
            filled: true as const,
            profile_id: a.profile_id as string,
            name: p?.full_name ?? '—',
            email: p?.institutional_email ?? '—',
            authorisedAt: new Date(
              a.authorised_at as string
            ).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            }),
          };
        }
      );

      // Pad to 3 slots
      const paddedSlots: Slot[] = [
        ...filledSlots,
        ...Array(Math.max(0, 3 - filledSlots.length)).fill({ filled: false }),
      ];
      setSlots(paddedSlots);

      // Fetch candidates (active requesters in Dean's department, excluding already-authorised)
      if (hodDeptId) {
        const authorisedIds = new Set(filledSlots.map((s) => s.profile_id));
        const { data: cands } = await supabase
          .from('profiles')
          .select('id, full_name, institutional_email')
          .eq('role', 'REQUESTER')
          .eq('status', 'ACTIVE')
          .eq('unit_id', hodDeptId);

        setCandidates(
          ((cands ?? []) as Candidate[]).filter((c) => !authorisedIds.has(c.id))
        );
      }

      setLoading(false);
    };

    init().catch(() => {
      setFetchError('Failed to load key data.');
      setLoading(false);
    });
  }, [keyId]);

  const handleRemove = async (slot: FilledSlot) => {
    setRemoving(true);
    setRemoveError(null);
    const result = await apiFetch(
      `/api/admin/authorisations/${keyId}/${slot.profile_id}`,
      { method: 'DELETE' }
    );
    setRemoving(false);
    if (result.error && result.status !== 204) {
      setRemoveError(result.error);
      return;
    }
    toast.success(`${slot.name} removed from collectors for ${keyData?.code}.`);
    startTransition(() => {
      setRemoveTarget(null);
      setSlots((prev) =>
        prev
          .filter((s) => !(s.filled && s.profile_id === slot.profile_id))
          .concat([{ filled: false }])
          .slice(0, 3)
      );
      setCandidates((prev) => [
        ...prev,
        {
          id: slot.profile_id,
          full_name: slot.name,
          institutional_email: slot.email,
        },
      ]);
    });
  };

  const handleAdd = async () => {
    if (!selectedCandidateId) return;
    setAdding(true);
    setAddError(null);
    const result = await apiFetch('/api/admin/authorisations', {
      method: 'POST',
      body: { key_id: keyId, requester_id: selectedCandidateId },
    });
    setAdding(false);
    if (result.error) {
      setAddError(result.error);
      return;
    }
    const candidate = candidates.find((c) => c.id === selectedCandidateId);
    if (candidate) {
      const newSlot: FilledSlot = {
        filled: true,
        profile_id: candidate.id,
        name: candidate.full_name,
        email: candidate.institutional_email,
        authorisedAt: new Date().toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
      };
      setSlots((prev) => {
        const vacantIdx = prev.findIndex((s) => !s.filled);
        if (vacantIdx === -1) return prev;
        const next = [...prev];
        next[vacantIdx] = newSlot;
        return next;
      });
      setCandidates((prev) => prev.filter((c) => c.id !== selectedCandidateId));
    }
    setAddPickerOpen(false);
    setSelectedCandidateId('');
    toast.success(`${candidate?.full_name ?? 'Collector'} added successfully.`);
  };

  const filledCount = slots.filter((s) => s.filled).length;
  const zoneLabel =
    keyData?.zone === 'NEW_SENATE' ? 'New Senate' : 'Old Senate';
  const dept = keyData?.department as { name: string } | null;

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
        <Skeleton className="h-6 w-32 rounded" />
        <Skeleton className="h-20 rounded-lg" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4"
          role="alert"
        >
          <p className="text-sm text-destructive">{fetchError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      {/* Key header */}
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-[0_2px_4px_rgba(15,23,42,0.06)] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <KeyRoundIcon className="size-5 text-primary" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <code className="font-mono text-lg font-semibold text-foreground">
                {keyData?.code}
              </code>
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                {zoneLabel}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {keyData?.room_name}
              {dept?.name ? ` · ${dept.name}` : ''}
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {filledCount} of 3 slots filled
        </p>
      </div>

      {/* Slot cards */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Authorised collectors
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {slots.map((slot, idx) =>
            slot.filled ? (
              <div
                key={slot.profile_id}
                className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-[0_2px_4px_rgba(15,23,42,0.06)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {slot.name
                      .split(' ')
                      .slice(-2)
                      .map((n) => n[0])
                      .join('')}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Slot {idx + 1}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {slot.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{slot.email}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Authorised {slot.authorisedAt}
                  </p>
                </div>

                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full text-xs bg-destructive text-white hover:bg-destructive/90 dark:bg-red-600 dark:hover:bg-red-700"
                  aria-label={`Remove ${slot.name}`}
                  onClick={() => {
                    setRemoveTarget(slot);
                    setRemoveError(null);
                  }}
                >
                  <Trash2Icon className="size-3.5" aria-hidden="true" />
                  Remove
                </Button>
              </div>
            ) : (
              <div
                key={`vacant-${idx}`}
                className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border bg-muted/30 p-8 text-center"
              >
                <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                  <UserIcon
                    className="size-5 text-muted-foreground"
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Slot {idx + 1} vacant
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    No collector assigned
                  </p>
                </div>

                {addPickerOpen &&
                !slots.slice(0, idx).some((s) => !s.filled) ? (
                  // Show picker in the first vacant slot
                  <div className="flex w-full flex-col gap-2">
                    <Label htmlFor={`picker-${idx}`} className="sr-only">
                      Select a collector
                    </Label>
                    <Select
                      value={selectedCandidateId}
                      onValueChange={setSelectedCandidateId}
                    >
                      <SelectTrigger id={`picker-${idx}`} className="text-xs">
                        <SelectValue placeholder="Select a collector" />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        {candidates.length === 0 ? (
                          <SelectItem value="__none" disabled>
                            No eligible staff
                          </SelectItem>
                        ) : (
                          candidates.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.full_name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    {addError && (
                      <p className="text-xs text-destructive" role="alert">
                        {addError}
                      </p>
                    )}
                    <div className="flex gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs"
                        onClick={() => {
                          setAddPickerOpen(false);
                          setSelectedCandidateId('');
                          setAddError(null);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 text-xs"
                        disabled={!selectedCandidateId || adding}
                        aria-busy={adding}
                        onClick={handleAdd}
                      >
                        {adding ? 'Adding...' : 'Add'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  !addPickerOpen && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAddPickerOpen(true);
                        setSelectedCandidateId('');
                        setAddError(null);
                      }}
                    >
                      <PlusIcon className="size-4" aria-hidden="true" />
                      Add collector
                    </Button>
                  )
                )}
              </div>
            )
          )}
        </div>
      </div>

      <AlertDialog
        open={!!removeTarget}
        onOpenChange={(open) => {
          if (!open) {
            setRemoveTarget(null);
            setRemoveError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove collector</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {removeTarget?.name} from the authorised collectors for
              this key? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {removeError && (
            <p className="text-sm text-destructive" role="alert">
              {removeError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              className="bg-destructive text-white hover:bg-destructive/90 dark:bg-red-600 dark:hover:bg-red-700"
              disabled={removing}
              aria-busy={removing}
              onClick={() => removeTarget && handleRemove(removeTarget)}
            >
              {removing ? 'Removing...' : 'Remove'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <KeyHistory keyId={keyId} />
    </div>
  );
};
