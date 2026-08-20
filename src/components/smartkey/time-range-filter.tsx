'use client';

import { useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarIcon } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';

import {
  RANGE_PRESET_OPTIONS,
  rangeFromDates,
  rangeFromPreset,
  type OptionalTimeRangeValue,
  type RangePreset,
} from '@/lib/date-range';
import { formatDateNumeric } from '@/lib/dates';
import {
  customDateRangeSchema,
  type CustomDateRangeInput,
} from '@/lib/validation/schemas';

import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

// Zod already guarantees YYYY-MM-DD by the time this runs (form won't submit
// otherwise), so a plain split is enough.
const parseDateInput = (v: string): Date => {
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y, m - 1, d);
};

type TimeRangeFilterProps = {
  value: OptionalTimeRangeValue;
  onChange: (value: OptionalTimeRangeValue) => void;
  // Adds an "All time" option alongside the presets, for surfaces that
  // should show full history by default (e.g. an audit log) rather than
  // always requiring a bounded window (e.g. a trend chart).
  allowAllTime?: boolean;
};

export const TimeRangeFilter = ({
  value,
  onChange,
  allowAllTime,
}: TimeRangeFilterProps) => {
  const [open, setOpen] = useState(false);

  const form = useForm<CustomDateRangeInput>({
    resolver: zodResolver(customDateRangeSchema),
    defaultValues: { from: '', to: '' },
  });

  const handlePresetChange = (preset: string) => {
    if (!preset) return;
    if (preset === 'all') {
      onChange({ preset: 'all', range: null });
      return;
    }
    const typedPreset = preset as Exclude<RangePreset, 'custom'>;
    onChange({ preset: typedPreset, range: rangeFromPreset(typedPreset) });
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) form.reset({ from: '', to: '' });
  };

  const onSubmit = form.handleSubmit((data) => {
    const from = parseDateInput(data.from);
    const to = parseDateInput(data.to);
    onChange({ preset: 'custom', range: rangeFromDates(from, to) });
    setOpen(false);
  });

  const customLabel =
    value.preset === 'custom'
      ? `${formatDateNumeric(value.range.from)} - ${formatDateNumeric(value.range.to)}`
      : 'Custom';

  return (
    <div className="flex items-center gap-2">
      <ToggleGroup
        type="single"
        variant="outline"
        spacing={0}
        value={value.preset === 'custom' ? '' : value.preset}
        onValueChange={handlePresetChange}
        aria-label="Time range"
      >
        {allowAllTime && (
          <ToggleGroupItem value="all" aria-label="All time">
            All time
          </ToggleGroupItem>
        )}
        {RANGE_PRESET_OPTIONS.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            aria-label={`Last ${option.label}`}
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant={value.preset === 'custom' ? 'default' : 'outline'}
            size="default"
            aria-label="Choose a custom date range"
          >
            <CalendarIcon aria-hidden="true" />
            {customLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3" align="end">
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <Controller
              name="from"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="range-from">Start date</FieldLabel>
                  <Input
                    id="range-from"
                    type="date"
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
              name="to"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="range-to">End date</FieldLabel>
                  <Input
                    id="range-to"
                    type="date"
                    aria-invalid={fieldState.invalid}
                    {...field}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <div className="flex justify-end">
              <Button type="submit" size="sm">
                Apply
              </Button>
            </div>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  );
};
