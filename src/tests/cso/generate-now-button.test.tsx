import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRefresh } = vi.hoisted(() => ({ mockRefresh: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { GenerateNowButton } from '@/app/cso/reports/[id]/_components/generate-now-button';

const jsonResponse = (body: unknown, ok = true, status = ok ? 201 : 409) => ({
  ok,
  status,
  json: async () => body,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GenerateNowButton', () => {
  it('renders the generate action', () => {
    global.fetch = vi.fn();
    render(<GenerateNowButton shiftId="shift-1" />);
    expect(
      screen.getByRole('button', { name: /generate now/i })
    ).toBeInTheDocument();
  });

  it('posts the shift id and refreshes on success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ data: { report_id: 'report-1' }, error: null })
      );
    global.fetch = fetchMock;

    const user = userEvent.setup();
    render(<GenerateNowButton shiftId="shift-1" />);
    await user.click(screen.getByRole('button', { name: /generate now/i }));

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/reports/generate',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ shift_id: 'shift-1' }),
      })
    );
  });

  it('marks the button busy while generating', async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    const user = userEvent.setup();
    render(<GenerateNowButton shiftId="shift-1" />);
    await user.click(screen.getByRole('button', { name: /generate now/i }));

    const busy = await screen.findByRole('button', { name: /generating/i });
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(busy).toBeDisabled();

    resolveFetch(jsonResponse({ data: { report_id: 'r' }, error: null }));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it('surfaces the server error and does not refresh', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          { data: null, error: 'Report already generated for this shift' },
          false,
          409
        )
      );

    const user = userEvent.setup();
    render(<GenerateNowButton shiftId="shift-1" />);
    await user.click(screen.getByRole('button', { name: /generate now/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /already generated/i
    );
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
