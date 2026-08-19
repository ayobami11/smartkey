'use client';

import { useEffect, useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircleIcon, PlusIcon } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { apiFetch } from '@/lib/api';
import { ZONE_LABELS } from '@/lib/constants';
import {
  createKeyFormSchema,
  type CreateKeyFormInput,
} from '@/lib/validation/schemas';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Unit = { id: string; name: string };

type Props = { onCreated: () => void };

export const CreateKeyDialog = ({ onCreated }: Props) => {
  const [open, setOpen] = useState(false);
  const [units, setUnits] = useState<Unit[]>([]);
  const [success, setSuccess] = useState(false);

  const form = useForm<CreateKeyFormInput>({
    resolver: zodResolver(createKeyFormSchema),
    defaultValues: {
      code: '',
      zone: undefined,
      room_name: '',
      unit_id: '',
      key_count: 1,
    },
  });

  useEffect(() => {
    if (!open) return;
    apiFetch<{ units: Unit[] }>('/api/admin/units').then((result) => {
      setUnits(result.data?.units ?? []);
    });
  }, [open]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      form.reset();
      setSuccess(false);
    }
    setOpen(next);
  };

  const onSubmit = async (data: CreateKeyFormInput) => {
    const result = await apiFetch('/api/admin/keys', {
      method: 'POST',
      body: data,
    });

    if (result.error) {
      toast.error(result.error);
      return;
    }

    setSuccess(true);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon className="size-4" aria-hidden="true" />
          Add key
        </Button>
      </DialogTrigger>

      <DialogContent className="grid max-h-[85vh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-md">
        {success ? (
          <div className="p-6">
            <div
              role="status"
              className="flex flex-col items-center gap-3 py-4 text-center"
            >
              <div className="flex size-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40">
                <CheckCircleIcon
                  className="size-6 text-emerald-600"
                  aria-hidden="true"
                />
              </div>
              <div>
                <p className="font-medium text-foreground">Key added</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  The key has been added to the inventory and is now available
                  for use.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <DialogHeader className="border-b border-border p-6">
              <DialogTitle>Add key</DialogTitle>
              <DialogDescription>
                Add a new key to the inventory. The key code must be unique
                across both zones (e.g. NS-304).
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={form.handleSubmit(onSubmit)} className="contents">
              <ScrollArea type="always" className="min-h-0">
                <FieldGroup className="p-6">
                  <Controller
                    name="code"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="key-code">Key code</FieldLabel>
                        <Input
                          id="key-code"
                          placeholder="NS-304"
                          aria-invalid={fieldState.invalid}
                          className="font-mono uppercase"
                          {...field}
                          onChange={(e) =>
                            field.onChange(e.target.value.toUpperCase())
                          }
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />

                  <Controller
                    name="zone"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="zone-select">Zone</FieldLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <SelectTrigger
                            id="zone-select"
                            className="w-full"
                            aria-invalid={fieldState.invalid}
                          >
                            <SelectValue placeholder="Select a zone" />
                          </SelectTrigger>
                          <SelectContent>
                            {(
                              Object.keys(ZONE_LABELS) as Array<
                                keyof typeof ZONE_LABELS
                              >
                            ).map((z) => (
                              <SelectItem key={z} value={z}>
                                {ZONE_LABELS[z]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />

                  <Controller
                    name="room_name"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="room-name">Room name</FieldLabel>
                        <Input
                          id="room-name"
                          placeholder="Dean's Office"
                          aria-invalid={fieldState.invalid}
                          {...field}
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />

                  <Controller
                    name="unit_id"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="unit-select">Unit</FieldLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <SelectTrigger
                            id="unit-select"
                            className="w-full"
                            aria-invalid={fieldState.invalid}
                          >
                            <SelectValue placeholder="Select a unit" />
                          </SelectTrigger>
                          <SelectContent>
                            {units.map((u) => (
                              <SelectItem key={u.id} value={u.id}>
                                {u.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />

                  <Controller
                    name="key_count"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="key-count">
                          Keys on bunch{' '}
                          <span className="text-muted-foreground">
                            (optional)
                          </span>
                        </FieldLabel>
                        <Input
                          id="key-count"
                          type="number"
                          min={1}
                          max={20}
                          aria-invalid={fieldState.invalid}
                          value={field.value}
                          onBlur={field.onBlur}
                          name={field.name}
                          ref={field.ref}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === '' ? 1 : Number(e.target.value)
                            )
                          }
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                </FieldGroup>
              </ScrollArea>

              <DialogFooter className="border-t border-border p-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={form.formState.isSubmitting}
                  aria-busy={form.formState.isSubmitting}
                >
                  {form.formState.isSubmitting ? 'Adding...' : 'Add key'}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
