'use client';

import { useEffect, useState } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircleIcon, UserPlusIcon } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { apiFetch } from '@/lib/api';
import {
  provisionUserSchema,
  type ProvisionUserInput,
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

import { ROLE_LABELS } from '@/lib/constants';

const ROLES = ['DEAN', 'VERIFIER', 'REQUESTER'] as const;

type FormValues = ProvisionUserInput;

type Department = {
  id: string;
  name: string;
  has_hod: boolean;
  authoriser: 'DEAN' | 'CSO';
};

type SuccessData = { name: string; email: string; role: string };

type Props = { onSuccess?: () => void };

export const ProvisionUserDialog = ({ onSuccess }: Props) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [successData, setSuccessData] = useState<SuccessData | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(provisionUserSchema),
    defaultValues: {
      full_name: '',
      institutional_email: '',
      role: undefined,
      unit_id: '',
    },
  });

  const selectedRole = form.watch('role');
  const needsDept = selectedRole === 'DEAN' || selectedRole === 'REQUESTER';

  useEffect(() => {
    if (!open) return;
    apiFetch<{ units: Department[] }>('/api/admin/units').then((result) => {
      setDepartments(result.data?.units ?? []);
    });
  }, [open]);

  async function onSubmit(data: FormValues) {
    setSuccessData(null);

    const result = await apiFetch('/api/admin/users', {
      method: 'POST',
      body: {
        full_name: data.full_name,
        institutional_email: data.institutional_email,
        role: data.role,
        unit_id: data.unit_id || undefined,
      },
    });

    if (result.error) {
      toast.error(result.error);
      return;
    }

    setSuccessData({
      name: data.full_name,
      email: data.institutional_email,
      role: ROLE_LABELS[data.role] ?? data.role,
    });
    form.reset();
    router.refresh();
    onSuccess?.();
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      form.reset();
      setSuccessData(null);
    }
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <UserPlusIcon className="size-4" aria-hidden="true" />
          Provision new user
        </Button>
      </DialogTrigger>

      <DialogContent className="grid max-h-[85vh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-md">
        {successData ? (
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
                <p className="font-medium text-foreground">Account created</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {successData.name} has been provisioned as a{' '}
                  {successData.role}. An activation email has been sent to{' '}
                  {successData.email}.
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
              <DialogTitle>Provision new user</DialogTitle>
              <DialogDescription>
                Create an account and send an activation link to the user&apos;s
                email.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={form.handleSubmit(onSubmit)} className="contents">
              <ScrollArea type="always" className="min-h-0">
                <FieldGroup className="p-6">
                  <Controller
                    name="full_name"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="full-name">Full name</FieldLabel>
                        <Input
                          id="full-name"
                          placeholder="Dr. Adebayo Okafor"
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
                    name="institutional_email"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="inst-email">
                          Institutional email
                        </FieldLabel>
                        <Input
                          id="inst-email"
                          type="email"
                          placeholder="user@unilag.edu.ng"
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
                    name="role"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="role-select">Role</FieldLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <SelectTrigger
                            id="role-select"
                            aria-invalid={fieldState.invalid}
                          >
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map((r) => (
                              <SelectItem key={r} value={r}>
                                {ROLE_LABELS[r]}
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

                  {needsDept && (
                    <Controller
                      name="unit_id"
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor="dept-select">Unit</FieldLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <SelectTrigger
                              id="dept-select"
                              aria-invalid={fieldState.invalid}
                            >
                              <SelectValue placeholder="Select a unit" />
                            </SelectTrigger>
                            <SelectContent>
                              {departments
                                .filter((d) =>
                                  selectedRole === 'DEAN'
                                    ? d.authoriser !== 'CSO'
                                    : true
                                )
                                .map((d) => (
                                  <SelectItem
                                    key={d.id}
                                    value={d.id}
                                    disabled={
                                      selectedRole === 'DEAN' && d.has_hod
                                    }
                                  >
                                    {d.name}
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
                  )}
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
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting
                    ? 'Creating...'
                    : 'Create account'}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
