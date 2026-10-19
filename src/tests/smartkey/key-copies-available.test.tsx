import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { KeyCopiesAvailable } from '@/components/smartkey/key-copies-available';

describe('KeyCopiesAvailable', () => {
  it('shows "x of n available" for a multi-copy key', () => {
    const { container } = render(
      <KeyCopiesAvailable available={3} total={12} />
    );
    expect(container).toHaveTextContent('3 of 12 available');
  });

  it('carries the full sentence as its accessible name', () => {
    render(<KeyCopiesAvailable available={3} total={12} />);
    expect(
      screen.getByRole('img', {
        name: '3 of 12 copies of this key available',
      })
    ).toBeInTheDocument();
  });

  it('pairs the text with a decorative icon', () => {
    const { container } = render(
      <KeyCopiesAvailable available={3} total={12} />
    );
    expect(
      container.querySelector('svg[aria-hidden="true"]')
    ).toBeInTheDocument();
  });

  it('uses no status colour: the count is information, the pill is the state', () => {
    const { container } = render(
      <KeyCopiesAvailable available={0} total={12} />
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('text-muted-foreground');
    expect(root.className).not.toMatch(
      /destructive|success|warning|emerald|amber|red-/
    );
    expect(container).toHaveTextContent('0 of 12 available');
  });

  it.each([1, 0])('renders nothing when the key has %i copy', (total) => {
    const { container } = render(
      <KeyCopiesAvailable available={1} total={total} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('clamps a count outside 0..total', () => {
    const { rerender, container } = render(
      <KeyCopiesAvailable available={-2} total={2} />
    );
    expect(container).toHaveTextContent('0 of 2 available');
    rerender(<KeyCopiesAvailable available={5} total={2} />);
    expect(container).toHaveTextContent('2 of 2 available');
  });
});
