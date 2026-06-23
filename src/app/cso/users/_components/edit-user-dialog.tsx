'use client';

import { useEffect, useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { editUserSchema, type EditUserInput } from '@/lib/validation/schemas';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type UserRow } from '@/app/cso/users/_components/columns';

type Department = { id: string; name: string; faculty: string };

type Props = {
  user: UserRow | null;
  onClose: () => void;
  onSuccess?: () => void;
};

export const EditUserDialog = ({ user, onClose, onSuccess }: Props) => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentId, setDepartmentId] = useState<string>('');

  const open = user !== null;
  const needsDept = user?.role === 'HOD' || user?.role === 'REQUESTER';

  const form = useForm<EditUserInput>({
    resolver: zodResolver(editUserSchema),
    defaultValues: { full_name: '', department_id: '' },
  });

  // Load the editable values whenever a different user is opened. The current
  // department is matched by name (the row carries the name, not the id) once
  // departments are fetched, see the effect below.
  useEffect(() => {
    if (user) {
      form.reset({ full_name: user.full_name, department_id: '' });
      setDepartmentId('');
    }
  }, [user, form]);

  // Fetch departments while editing a departmental role, then preselect the
  // user's current department by matching its name.
  useEffect(() => {
    if (!open || !needsDept) return;
    fetch('/api/admin/departments')
      .then((r) => r.json())
      .then((json) => {
        const depts: Department[] = json.data?.departments ?? [];
        setDepartments(depts);
        const current = depts.find((d) => d.name === user?.department);
        if (current) {
          setDepartmentId(current.id);
          form.setValue('department_id', current.id);
        }
      });
  }, [open, needsDept, user?.department, form]);

  const onSubmit = async (data: EditUserInput) => {
    if (!user) return;

    if (needsDept && !data.department_id) {
      form.setError('department_id', {
        type: 'manual',
        message: 'Department is required for this role',
      });
      return;
    }

    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: data.full_name,
        department_id: needsDept ? data.department_id : undefined,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ?? 'Failed to update user.');
      return;
    }

    toast.success(`${data.full_name}'s details updated.`);
    onSuccess?.();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>
            Update the user&apos;s name{needsDept ? ' and department' : ''}.
            Email and role cannot be changed here.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup className="py-2">
            <Controller
              name="full_name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="edit-full-name">Full name</FieldLabel>
                  <Input
                    id="edit-full-name"
                    aria-invalid={fieldState.invalid}
                    {...field}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            {/* Email is shown for context but is not editable. */}
            <Field>
              <FieldLabel htmlFor="edit-email">Institutional email</FieldLabel>
              <Input
                id="edit-email"
                type="email"
                value={user?.institutional_email ?? ''}
                readOnly
                className="cursor-not-allowed bg-muted/50 text-muted-foreground"
              />
            </Field>

            {needsDept && (
              <Controller
                name="department_id"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="edit-dept-select">
                      Department
                    </FieldLabel>
                    <Select
                      value={departmentId}
                      onValueChange={(v) => {
                        setDepartmentId(v);
                        field.onChange(v);
                      }}
                    >
                      <SelectTrigger
                        id="edit-dept-select"
                        aria-invalid={fieldState.invalid}
                      >
                        <SelectValue placeholder="Select a department" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(
                          departments.reduce<Record<string, Department[]>>(
                            (acc, d) => {
                              const faculty = d.faculty || 'Other';
                              (acc[faculty] ??= []).push(d);
                              return acc;
                            },
                            {}
                          )
                        ).map(([faculty, depts]) => (
                          <SelectGroup key={faculty}>
                            <SelectLabel>{faculty}</SelectLabel>
                            {depts.map((d) => (
                              <SelectItem key={d.id} value={d.id}>
                                {d.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
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
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
