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
    // '1d' preset: from and to should be roughly 24h apart.
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

  it('opens the popover with the Apply button disabled until a full range is drafted', async () => {
    const user = userEvent.setup();
    render(<TimeRangeFilter value={weekValue} onChange={() => {}} />);
    await user.click(
      screen.getByRole('button', { name: /choose a custom date range/i })
    );
    expect(screen.getByRole('button', { name: /^apply$/i })).toBeDisabled();
  });
});
