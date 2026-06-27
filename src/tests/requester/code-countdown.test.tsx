import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CodeCountdown } from '@/app/requester/request/[requestId]/code/_components/code-countdown';

// Fixed reference time: 2099-01-01 00:00:00 UTC
const NOW = new Date('2099-01-01T00:00:00.000Z');
// codeExpiresAt is exactly 10 minutes from NOW → progress = 100%
const TEN_MIN_FROM_NOW = '2099-01-01T00:10:00.000Z';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CodeCountdown', () => {
  it('returns null when codeExpiresAt is null', () => {
    const { container } = render(
      <CodeCountdown countdown={600} codeExpiresAt={null} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('displays MM:SS format for a countdown under 1 hour', () => {
    render(<CodeCountdown countdown={599} codeExpiresAt={TEN_MIN_FROM_NOW} />);
    expect(screen.getByText('09:59')).toBeInTheDocument();
  });

  it('aria-label on the time span describes remaining time', () => {
    render(<CodeCountdown countdown={599} codeExpiresAt={TEN_MIN_FROM_NOW} />);
    expect(screen.getByLabelText('Expires in 09:59')).toBeInTheDocument();
  });

  it('displays hours format for a countdown >= 3600s', () => {
    render(<CodeCountdown countdown={3661} codeExpiresAt={TEN_MIN_FROM_NOW} />);
    expect(screen.getByText('1h 1m')).toBeInTheDocument();
  });

  it('displays days format for a countdown >= 86400s', () => {
    render(
      <CodeCountdown countdown={90061} codeExpiresAt={TEN_MIN_FROM_NOW} />
    );
    expect(screen.getByText('1d 1h')).toBeInTheDocument();
  });

  it('displays 00:00 when countdown is zero', () => {
    render(<CodeCountdown countdown={0} codeExpiresAt={TEN_MIN_FROM_NOW} />);
    expect(screen.getByText('00:00')).toBeInTheDocument();
  });

  it('clock icon is aria-hidden', () => {
    const { container } = render(
      <CodeCountdown countdown={599} codeExpiresAt={TEN_MIN_FROM_NOW} />
    );
    const icon = container.querySelector('svg[aria-hidden="true"]');
    expect(icon).toBeInTheDocument();
  });

  it('renders a progress bar', () => {
    render(<CodeCountdown countdown={599} codeExpiresAt={TEN_MIN_FROM_NOW} />);
    // shadcn Progress renders with role="progressbar"
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('progress indicator is fully visible when code is freshly issued', () => {
    // NOW = codeExpiresAt - 10 min → progress = 100 → translateX(-0%)
    const { container } = render(
      <CodeCountdown countdown={600} codeExpiresAt={TEN_MIN_FROM_NOW} />
    );
    const indicator = container.querySelector(
      '[data-slot="progress-indicator"]'
    );
    expect(indicator).toHaveStyle({ transform: 'translateX(-0%)' });
  });

  it('progress indicator is fully hidden when the code has expired', () => {
    // Time past expiry → progress = 0 → translateX(-100%)
    vi.setSystemTime(new Date('2099-01-01T00:11:00.000Z'));
    const { container } = render(
      <CodeCountdown countdown={0} codeExpiresAt={TEN_MIN_FROM_NOW} />
    );
    const indicator = container.querySelector(
      '[data-slot="progress-indicator"]'
    );
    expect(indicator).toHaveStyle({ transform: 'translateX(-100%)' });
  });
});
