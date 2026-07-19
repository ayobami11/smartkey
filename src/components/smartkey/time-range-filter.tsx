'use client';

import { useState } from 'react';

import { CalendarIcon } from 'lucide-react';
import type { DateRange as DayPickerRange } from 'react-day-picker';

import {
  RANGE_PRESET_OPTIONS,
  rangeFromDates,
  rangeFromPreset,
  type OptionalTimeRangeValue,
  type RangePreset,
} from '@/lib/date-range';
import { formatDateNumeric } from '@/lib/dates';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

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
  const [draft, setDraft] = useState<DayPickerRange | undefined>();

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
    if (next) setDraft(undefined);
  };

  const handleApply = () => {
    if (!draft?.from || !draft?.to) return;
    onChange({ preset: 'custom', range: rangeFromDates(draft.from, draft.to) });
    setOpen(false);
  };

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
            size="sm"
            aria-label="Choose a custom date range"
          >
            <CalendarIcon aria-hidden="true" />
            {customLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="end">
          <Calendar
            mode="range"
            numberOfMonths={2}
            selected={draft}
            onSelect={setDraft}
            disabled={{ after: new Date() }}
          />
          <div className="mt-3 flex justify-end">
            <Button
              size="sm"
              onClick={handleApply}
              disabled={!draft?.from || !draft?.to}
            >
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
