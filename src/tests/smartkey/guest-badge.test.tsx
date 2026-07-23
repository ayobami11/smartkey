import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GuestBadge } from '@/components/smartkey/guest-badge';

describe('GuestBadge', () => {
  it('renders the default "Guest" label with no icon', () => {
    const { container } = render(<GuestBadge />);
    expect(screen.getByText('Guest')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  it('renders a custom label', () => {
    render(<GuestBadge label="External requester" />);
    expect(screen.getByText('External requester')).toBeInTheDocument();
  });

  it('renders the icon when showIcon is true', () => {
    const { container } = render(<GuestBadge showIcon />);
    expect(
      container.querySelector('svg[aria-hidden="true"]')
    ).toBeInTheDocument();
  });

  it('derives aria-label from the label prop, lowercased', () => {
    render(<GuestBadge label="Guest" />);
    expect(screen.getByLabelText('External guest')).toBeInTheDocument();
  });

  it('derives aria-label from a custom label', () => {
    render(<GuestBadge label="Visitor" />);
    expect(screen.getByLabelText('External visitor')).toBeInTheDocument();
  });
});
