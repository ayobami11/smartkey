import { format } from 'date-fns';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { OptionalTimeRangeValue } from '@/lib/date-range';
import { TimeRangeFilter } from '@/components/smartkey/time-range-filter';

const weekValue: OptionalTimeRangeValue = {
  preset: '1w',
  range: { from: '2026-06-01T00:00:00.000Z', to: '2026-06-08T00:00:00.000Z' },
};

const customValue: OptionalTimeRangeValue = {
  preset: 'custom',
  range: { from: '2026-06-01T00:00:00.000Z', to: '2026-06-07T00:00:00.000Z' },
};

const allTimeValue: OptionalTimeRangeValue = { preset: 'all', range: null };

const toDateInput = (d: Date) => format(d, 'yyyy-MM-dd');

const openCustomPopover = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(
    screen.getByRole('button', { name: /choose a custom date range/i })
  );
};

describe('TimeRangeFilter', () => {
  it('renders the four preset options and no "All time" option by default', () => {
    render(<TimeRangeFilter value={weekValue} onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: /last 1d/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /last 1w/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /last 1m/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /last 1y/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('radio', { name: /^all time$/i })
    ).not.toBeInTheDocument();
  });

  it('renders the "All time" option when allowAllTime is set', () => {
    render(
      <TimeRangeFilter value={allTimeValue} onChange={() => {}} allowAllTime />
    );
    expect(
      screen.getByRole('radio', { name: /^all time$/i })
    ).toBeInTheDocument();
  });

  it('calls onChange with the preset and a computed from/to range when a preset is clicked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TimeRangeFilter value={weekValue} onChange={onChange} />);
    await user.click(screen.getByRole('radio', { name: /last 1d/i }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const [arg] = onChange.mock.calls[0];
    expect(arg.preset).toBe('1d');
    expect(new Date(arg.range.to).getTime()).toBeGreaterThan(
      new Date(arg.range.from).getTime()
    );
    const spanMs =
      new Date(arg.range.to).getTime() - new Date(arg.range.from).getTime();
    expect(spanMs).toBeCloseTo(24 * 60 * 60 * 1000, -3);
  });

  it('calls onChange with the "all" preset and a null range when "All time" is clicked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <TimeRangeFilter value={weekValue} onChange={onChange} allowAllTime />
    );
    await user.click(screen.getByRole('radio', { name: /^all time$/i }));
    expect(onChange).toHaveBeenCalledWith({ preset: 'all', range: null });
  });

  it('shows "Custom" on the custom button for a non-custom value', () => {
    render(<TimeRangeFilter value={weekValue} onChange={() => {}} />);
    expect(
      screen.getByRole('button', { name: /choose a custom date range/i })
    ).toHaveTextContent('Custom');
  });

  it('shows the formatted range on the custom button for a custom value', () => {
    render(<TimeRangeFilter value={customValue} onChange={() => {}} />);
    expect(
      screen.getByRole('button', { name: /choose a custom date range/i })
    ).toHaveTextContent('1 Jun 2026 - 7 Jun 2026');
  });

  it('opens the popover with empty Start/End date fields', async () => {
    const user = userEvent.setup();
    render(<TimeRangeFilter value={weekValue} onChange={() => {}} />);
    await openCustomPopover(user);

    expect(screen.getByLabelText(/start date/i)).toHaveValue('');
    expect(screen.getByLabelText(/end date/i)).toHaveValue('');
  });

  it('shows a validation error under each field on submit when both are empty', async () => {
    const user = userEvent.setup();
    render(<TimeRangeFilter value={weekValue} onChange={() => {}} />);
    await openCustomPopover(user);

    await user.click(screen.getByRole('button', { name: /^apply$/i }));

    expect(
      await screen.findByText(/start date is required/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/end date is required/i)).toBeInTheDocument();
  });

  it('shows a validation error under End date when it is before Start date', async () => {
    const user = userEvent.setup();
    render(<TimeRangeFilter value={weekValue} onChange={() => {}} />);
    await openCustomPopover(user);

    await user.type(screen.getByLabelText(/start date/i), '2026-01-05');
    await user.type(screen.getByLabelText(/end date/i), '2026-01-01');
    await user.click(screen.getByRole('button', { name: /^apply$/i }));

    expect(
      await screen.findByText(/end date must be on or after the start date/i)
    ).toBeInTheDocument();
  });

  it('shows a validation error when a date is in the future', async () => {
    const user = userEvent.setup();
    render(<TimeRangeFilter value={weekValue} onChange={() => {}} />);
    await openCustomPopover(user);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    await user.type(screen.getByLabelText(/start date/i), '2026-01-01');
    await user.type(screen.getByLabelText(/end date/i), toDateInput(tomorrow));
    await user.click(screen.getByRole('button', { name: /^apply$/i }));

    expect(
      await screen.findByText(/end date cannot be in the future/i)
    ).toBeInTheDocument();
  });

  it('the Apply button is never disabled', async () => {
    const user = userEvent.setup();
    render(<TimeRangeFilter value={weekValue} onChange={() => {}} />);
    await openCustomPopover(user);

    expect(screen.getByRole('button', { name: /^apply$/i })).toBeEnabled();
  });

  it('submits a valid range and calls onChange with the computed dates', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TimeRangeFilter value={weekValue} onChange={onChange} />);
    await openCustomPopover(user);

    await user.type(screen.getByLabelText(/start date/i), '2026-01-01');
    await user.type(screen.getByLabelText(/end date/i), '2026-01-05');
    await user.click(screen.getByRole('button', { name: /^apply$/i }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const [arg] = onChange.mock.calls[0];
    expect(arg.preset).toBe('custom');
    expect(new Date(arg.range.from).getDate()).toBe(1);
    expect(new Date(arg.range.to).getDate()).toBe(5);
  });

  it('resets the form fields each time the popover is reopened', async () => {
    const user = userEvent.setup();
    render(<TimeRangeFilter value={weekValue} onChange={() => {}} />);
    await openCustomPopover(user);

    await user.type(screen.getByLabelText(/start date/i), '2026-01-01');
    // Close without applying.
    await user.keyboard('{Escape}');

    await openCustomPopover(user);
    expect(screen.getByLabelText(/start date/i)).toHaveValue('');
  });
});
