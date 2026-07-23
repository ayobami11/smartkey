import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { TimelineEntry } from '@/lib/ai/reports/types';
import { ShiftTimeline } from '@/components/smartkey/shift-timeline';

const entries: TimelineEntry[] = [
  {
    time: '07:02',
    event: 'Shift started',
    description: 'Officer Musa on duty.',
  },
  {
    time: '09:14',
    event: 'Key issued',
    description: 'NS-304 issued to Dr. Bakare.',
  },
];

describe('ShiftTimeline', () => {
  it('renders the empty-state message when there are no entries', () => {
    render(<ShiftTimeline entries={[]} />);
    expect(
      screen.getByText('No timeline events for this shift.')
    ).toBeInTheDocument();
  });

  it('renders one list item per entry, in order', () => {
    render(<ShiftTimeline entries={entries} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
  });

  it('renders the time, event, and description for each entry', () => {
    render(<ShiftTimeline entries={entries} />);
    expect(screen.getByText('07:02')).toBeInTheDocument();
    expect(screen.getByText('Shift started')).toBeInTheDocument();
    expect(screen.getByText('Officer Musa on duty.')).toBeInTheDocument();
    expect(screen.getByText('09:14')).toBeInTheDocument();
    expect(screen.getByText('Key issued')).toBeInTheDocument();
    expect(
      screen.getByText('NS-304 issued to Dr. Bakare.')
    ).toBeInTheDocument();
  });
});
