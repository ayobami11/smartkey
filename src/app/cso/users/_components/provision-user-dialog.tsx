'use client';

import { useEffect, useState } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { UserPlusIcon } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ROLES = ['HOD', 'VERIFIER', 'REQUESTER'] as const;

type FormValues = ProvisionUserInput;

type Department = { id: string; name: string };

type Props = { onSuccess?: () => void };

export const ProvisionUserDialog = ({ onSuccess }: Props) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [success, setSuccess] = useState('');

  const form = useForm<FormValues>({
    resolver: zodResolver(provisionUserSchema),
    defaultValues: {
      full_name: '',
      institutional_email: '',
      role: undefined,
      department_id: '',
    },
  });

  const selectedRole = form.watch('role');
  const needsDept = selectedRole === 'HOD' || selectedRole === 'REQUESTER';

  useEffect(() => {
    if (!open) return;
    fetch('/api/admin/departments')
      .then((r) => r.json())
      .then((json) => setDepartments(json.data?.departments ?? []));
  }, [open]);

  async function onSubmit(data: FormValues) {
    setSuccess('');

    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: data.full_name,
        institutional_email: data.institutional_email,
        role: data.role,
        department_id: data.department_id || undefined,
      }),
    });

    const json = await res.json();

    if (!res.ok) {
      toast.error(json.error ?? 'Something went wrong. Try again.');
      return;
    }

    setSuccess(
      `Account created. ${data.institutional_email} will receive an activation email.`
    );
    form.reset();
    router.refresh();
    onSuccess?.();

    setTimeout(() => {
      setOpen(false);
      setSuccess('');
    }, 2500);
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      form.reset();
      setSuccess('');
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

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Provision new user</DialogTitle>
          <DialogDescription>
            Create an account and send an activation link to the user&apos;s
            email.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <p role="status" className="py-4 text-sm text-emerald-600">
            {success}
          </p>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <FieldGroup className="py-2">
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
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger
                        id="role-select"
                        aria-invalid={fieldState.invalid}
                      >
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r === 'HOD'
                              ? 'Head of Department'
                              : r === 'VERIFIER'
                                ? 'Verifier'
                                : 'Requester'}
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
                  name="department_id"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="dept-select">Department</FieldLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <SelectTrigger
                          id="dept-select"
                          aria-invalid={fieldState.invalid}
                        >
                          <SelectValue placeholder="Select a department" />
                        </SelectTrigger>
                        <SelectContent>
                          {departments.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
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

            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Creating…' : 'Create account'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
