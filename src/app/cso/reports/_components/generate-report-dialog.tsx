'use client';

import { useState } from 'react';

import Link from 'next/link';

import { useQuery } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { CalendarIcon, FileTextIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createBrowserClient } from '@/lib/supabase/client';
import {
  generateReportSchema,
  type GenerateReportInput,
} from '@/lib/validation/schemas';

import { formatDate } from '@/app/cso/reports/_components/reports-list';

type ShiftOption = { id: string; label: string };

type Props = { onGenerated?: () => void };

export const GenerateReportDialog = ({ onGenerated }: Props) => {
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generatedReportId, setGeneratedReportId] = useState<string | null>(
    null
  );

  const form = useForm<GenerateReportInput>({
    resolver: zodResolver(generateReportSchema),
    defaultValues: { shift_id: '' },
  });

  const { data: shifts = [] } = useQuery<ShiftOption[]>({
    queryKey: ['cso', 'shifts'],
    queryFn: async () => {
      const supabase = createBrowserClient();
      const { data } = await supabase
        .from('shifts')
        .select('id, shift_number, started_at')
        .order('started_at', { ascending: false })
        .limit(20);
      return (data ?? []).map((s) => ({
        id: s.id,
        label: `Shift ${s.shift_number} — ${formatDate(s.started_at)}`,
      }));
    },
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      form.reset({ shift_id: '' });
      setGenerateError(null);
      setGeneratedReportId(null);
    }
  };

  const handleGenerate = async (values: GenerateReportInput) => {
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shift_id: values.shift_id }),
      });
      const json = await res.json();
      if (!res.ok) {
        setGenerateError(json.error ?? 'Failed to generate report.');
        return;
      }
      setGeneratedReportId(json.data?.report_id ?? null);
      onGenerated?.();
    } catch {
      setGenerateError('Something went wrong. Check your connection.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <FileTextIcon className="size-4" aria-hidden="true" />
          Generate report now
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate shift report</DialogTitle>
          <DialogDescription>
            Select a completed shift to generate an AI-powered summary.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {generatedReportId ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40">
                <CalendarIcon
                  className="size-6 text-emerald-600"
                  aria-hidden="true"
                />
              </div>
              <p className="font-medium text-foreground">Report generated</p>
              <Link
                href={`/cso/reports/${generatedReportId}`}
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                View report
              </Link>
            </div>
          ) : (
            <>
              <Controller
                name="shift_id"
                control={form.control}
                render={({ field, fieldState }) => (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="shift-select">Shift</Label>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger
                        id="shift-select"
                        aria-invalid={fieldState.invalid}
                      >
                        <SelectValue placeholder="Select a shift" />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        {shifts.length === 0 ? (
                          <SelectItem value="__none" disabled>
                            No shifts available
                          </SelectItem>
                        ) : (
                          shifts.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.label}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    {fieldState.invalid && (
                      <p className="text-sm text-destructive" role="alert">
                        {fieldState.error?.message}
                      </p>
                    )}
                  </div>
                )}
              />
              {generateError && (
                <p className="text-sm text-destructive" role="alert">
                  {generateError}
                </p>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          {generatedReportId ? (
            <DialogClose asChild>
              <Button className="w-full">Close</Button>
            </DialogClose>
          ) : (
            <>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button
                disabled={generating}
                aria-busy={generating}
                onClick={form.handleSubmit(handleGenerate)}
              >
                {generating ? 'Generating…' : 'Generate'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
