import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  getConnectionStatus,
  setConnectionStatus,
} from '@/hooks/use-connection-status';
import { OfflineBanner } from '@/components/smartkey/offline-banner';

afterEach(() => {
  // Unmount components before resetting module-level state so the
  // setConnectionStatus call doesn't trigger a state update on a still-mounted
  // component outside of act().
  cleanup();
  if (getConnectionStatus() !== 'connected') {
    act(() => setConnectionStatus('connected'));
  }
});

describe('OfflineBanner', () => {
  it('renders nothing when connected', () => {
    const { container } = render(<OfflineBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when reconnecting', () => {
    setConnectionStatus('reconnecting');
    const { container } = render(<OfflineBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the banner when offline', () => {
    setConnectionStatus('offline');
    render(<OfflineBanner />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('displays the correct offline message', () => {
    setConnectionStatus('offline');
    render(<OfflineBanner />);
    expect(screen.getByText(/you are offline/i)).toBeInTheDocument();
    expect(screen.getByText(/live updates are paused/i)).toBeInTheDocument();
  });

  it('has aria-live="assertive" for urgent announcement', () => {
    setConnectionStatus('offline');
    render(<OfflineBanner />);
    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-live',
      'assertive'
    );
  });

  it('decorative icon has aria-hidden="true"', () => {
    setConnectionStatus('offline');
    render(<OfflineBanner />);
    const icon = screen.getByRole('status').querySelector('svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });
});
