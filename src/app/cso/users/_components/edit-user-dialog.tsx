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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type UserRow } from '@/app/cso/users/_components/columns';

type Department = { id: string; name: string; has_hod: boolean };

type Props = {
  user: UserRow | null;
  onClose: () => void;
  onSuccess?: () => void;
};

export const EditUserDialog = ({ user, onClose, onSuccess }: Props) => {
  const [departments, setDepartments] = useState<Department[]>([]);

  const open = user !== null;
  const needsDept = user?.role === 'DEAN' || user?.role === 'REQUESTER';

  const form = useForm<EditUserInput>({
    resolver: zodResolver(editUserSchema),
    defaultValues: { full_name: '', unit_id: '' },
  });

  // Load the editable values whenever a different user is opened. The current
  // department is matched by name (the row carries the name, not the id) once
  // departments are fetched, see the effect below.
  useEffect(() => {
    if (!user) return;
    const id = user.id;
    Promise.resolve().then(() => {
      if (id !== user?.id) return;
      form.reset({ full_name: user.full_name, unit_id: '' });
    });
  }, [user, form]);

  // Fetch departments while editing a departmental role, then preselect the
  // user's current department by matching its name.
  useEffect(() => {
    if (!open || !needsDept) return;
    fetch('/api/admin/units')
      .then((r) => r.json())
      .then((json) => {
        const depts: Department[] = json.data?.units ?? [];
        setDepartments(depts);
        const current = depts.find((d) => d.name === user?.department);
        if (current) {
          form.setValue('unit_id', current.id);
        }
      });
  }, [open, needsDept, user?.department, form]);

  const onSubmit = async (data: EditUserInput) => {
    if (!user) return;

    if (needsDept && !data.unit_id) {
      form.setError('unit_id', {
        type: 'manual',
        message: 'Unit is required for this role',
      });
      return;
    }

    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: data.full_name,
        unit_id: needsDept ? data.unit_id : undefined,
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
            Update the user&apos;s name
            {needsDept ? ' and unit' : ''}. Email and role cannot be changed
            here.
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
                name="unit_id"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="edit-dept-select">Unit</FieldLabel>
                    <Select
                      value={field.value ?? ''}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger
                        id="edit-dept-select"
                        aria-invalid={fieldState.invalid}
                      >
                        <SelectValue placeholder="Select a unit" />
                      </SelectTrigger>
                      <SelectContent>
                        {departments.map((d) => (
                          <SelectItem
                            key={d.id}
                            value={d.id}
                            disabled={
                              user?.role === 'DEAN' &&
                              d.has_hod &&
                              d.id !== field.value
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

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Saving\u2026' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
