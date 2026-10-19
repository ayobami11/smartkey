import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { KeyCard, type Key } from '@/app/cso/keys/_components/key-card';

const key = (overrides: Partial<Key> = {}): Key => ({
  id: 'key-1',
  code: 'FENG-005',
  zone: 'NEW_SENATE',
  room: 'Electrical Engineering HOD Office',
  department: 'Faculty of Engineering',
  status: 'AVAILABLE',
  key_count: 12,
  ...overrides,
});

const renderCard = (keyItem: Key, available?: number | null) =>
  render(
    <KeyCard keyItem={keyItem} available={available} onMarkLost={vi.fn()} />
  );

describe('KeyCard copies available', () => {
  it('shows "x of n available" beside the status pill for a multi-copy key', () => {
    renderCard(key(), 3);
    expect(screen.getByLabelText('Status: Available')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: '3 of 12 copies of this key available' })
    ).toHaveTextContent('3 of 12 available');
    expect(screen.queryByText(/keys$/)).not.toBeInTheDocument();
  });

  it('shows how many copies exist until availability is known', () => {
    const { container } = renderCard(key(), null);
    expect(container).toHaveTextContent('12 keys for this room');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('leaves a single-copy key unchanged', () => {
    const { container } = renderCard(key({ code: 'NS-304', key_count: 1 }), 1);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent('available');
    expect(container).not.toHaveTextContent('keys for this room');
  });

  it('does not show a count for a retired key', () => {
    const { container } = renderCard(key({ status: 'RETIRED' }), 0);
    expect(screen.getByLabelText('Status: Retired')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container).toHaveTextContent('12 keys for this room');
  });
});
