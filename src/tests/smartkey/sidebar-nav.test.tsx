import { KeyIcon } from 'lucide-react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: mockUsePathname,
}));

import { SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { NavMain } from '@/components/smartkey/sidebar-nav';

const items = [
  { title: 'Dashboard', url: '/cso' },
  { title: 'Keys', url: '/cso/keys', icon: KeyIcon },
];

const renderNav = () =>
  render(
    <TooltipProvider>
      <SidebarProvider>
        <NavMain items={items} />
      </SidebarProvider>
    </TooltipProvider>
  );

describe('NavMain', () => {
  it('renders a link per item pointing at its url', () => {
    mockUsePathname.mockReturnValue('/cso');
    renderNav();
    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute(
      'href',
      '/cso'
    );
    expect(screen.getByRole('link', { name: /keys/i })).toHaveAttribute(
      'href',
      '/cso/keys'
    );
  });

  it('renders an icon only for items that provide one', () => {
    mockUsePathname.mockReturnValue('/cso');
    const { container } = renderNav();
    const links = screen.getAllByRole('link');
    expect(links[0].querySelector('svg')).not.toBeInTheDocument();
    expect(links[1].querySelector('svg')).toBeInTheDocument();
    expect(container.querySelectorAll('svg')).toHaveLength(1);
  });

  it('marks the item active on an exact pathname match', () => {
    mockUsePathname.mockReturnValue('/cso');
    renderNav();
    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute(
      'data-active',
      'true'
    );
    expect(screen.getByRole('link', { name: /keys/i })).toHaveAttribute(
      'data-active',
      'false'
    );
  });

  it('marks the item active on a nested pathname match', () => {
    // '/cso/keys/123' is not an exact match for either url, but it starts
    // with '/cso/keys/' so the Keys item (not just the '/cso' root) must
    // still be recognised as active.
    mockUsePathname.mockReturnValue('/cso/keys/123');
    renderNav();
    expect(screen.getByRole('link', { name: /keys/i })).toHaveAttribute(
      'data-active',
      'true'
    );
  });

  it('does not mark an unrelated sibling path as active', () => {
    mockUsePathname.mockReturnValue('/cso/keystone');
    renderNav();
    expect(screen.getByRole('link', { name: /keys/i })).toHaveAttribute(
      'data-active',
      'false'
    );
  });
});
