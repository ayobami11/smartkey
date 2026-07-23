import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SectionCardHeader } from '@/components/smartkey/section-card-header';

describe('SectionCardHeader', () => {
  it('renders the title', () => {
    render(<SectionCardHeader title="Pending requests" />);
    expect(
      screen.getByRole('heading', { name: /pending requests/i })
    ).toBeInTheDocument();
  });

  it('does not render a badge when count is undefined', () => {
    render(<SectionCardHeader title="Pending requests" />);
    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
  });

  it('does not render a badge when count is 0', () => {
    render(<SectionCardHeader title="Pending requests" count={0} />);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('renders a badge with the count and derived aria-label when count > 0', () => {
    render(<SectionCardHeader title="Pending requests" count={3} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByLabelText('3 pending requests')).toBeInTheDocument();
  });

  it('uses countLabel over the title for the aria-label when provided', () => {
    render(
      <SectionCardHeader
        title="Pending requests"
        count={3}
        countLabel="unread"
      />
    );
    expect(screen.getByLabelText('3 unread')).toBeInTheDocument();
  });

  it('defaults the badge variant to secondary (neutral)', () => {
    render(<SectionCardHeader title="Pending requests" count={3} />);
    expect(screen.getByText('3')).toHaveAttribute('data-variant', 'secondary');
  });

  it('uses the default badge variant when badgeVariant="primary"', () => {
    render(
      <SectionCardHeader
        title="Pending requests"
        count={3}
        badgeVariant="primary"
      />
    );
    expect(screen.getByText('3')).toHaveAttribute('data-variant', 'default');
  });

  it('does not render a "View all" link when viewAllHref is absent', () => {
    render(<SectionCardHeader title="Pending requests" />);
    expect(
      screen.queryByRole('link', { name: /view all/i })
    ).not.toBeInTheDocument();
  });

  it('renders a "View all" link pointing at viewAllHref when provided', () => {
    render(
      <SectionCardHeader
        title="Pending requests"
        viewAllHref="/cso/weekend-requests"
      />
    );
    expect(screen.getByRole('link', { name: /view all/i })).toHaveAttribute(
      'href',
      '/cso/weekend-requests'
    );
  });
});
