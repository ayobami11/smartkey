import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPush } = vi.hoisted(() => ({ mockPush: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { DashboardHeaderAvatar } from '@/components/smartkey/dashboard-header-avatar';

const profileResponse = (name: string, email: string, photoUrl = '') => ({
  ok: true,
  json: async () => ({
    data: {
      profile: {
        full_name: name,
        institutional_email: email,
        photo_url: photoUrl,
      },
    },
  }),
});

// Returns a fetch Promise that never resolves, keeping the component in loading state
const pendingFetch = () => new Promise<Response>(() => {});

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DashboardHeaderAvatar', () => {
  it('shows a loading skeleton before the profile resolves', () => {
    vi.mocked(global.fetch).mockReturnValueOnce(pendingFetch());
    render(<DashboardHeaderAvatar settingsHref="/settings" />);
    expect(
      screen.queryByRole('button', { name: /account menu/i })
    ).not.toBeInTheDocument();
  });

  it('renders the account menu button once the profile loads', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      profileResponse(
        'Ada Lovelace',
        'ada@unilag.edu.ng'
      ) as unknown as Response
    );
    render(<DashboardHeaderAvatar settingsHref="/settings" />);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /account menu/i })
      ).toBeInTheDocument()
    );
  });

  it('trigger button has aria-label="Account menu"', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      profileResponse(
        'Ada Lovelace',
        'ada@unilag.edu.ng'
      ) as unknown as Response
    );
    render(<DashboardHeaderAvatar settingsHref="/settings" />);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Account menu' })
      ).toHaveAttribute('aria-label', 'Account menu');
    });
  });

  it('displays initials when no photo URL is provided', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      profileResponse(
        'Ada Lovelace',
        'ada@unilag.edu.ng',
        ''
      ) as unknown as Response
    );
    render(<DashboardHeaderAvatar settingsHref="/settings" />);
    await waitFor(() => {
      const initialsEls = screen.getAllByText('AL');
      expect(initialsEls.length).toBeGreaterThan(0);
    });
  });

  it('falls back to "?" when no name is returned', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      profileResponse('', '') as unknown as Response
    );
    render(<DashboardHeaderAvatar settingsHref="/settings" />);
    await waitFor(() => {
      const fallbacks = screen.getAllByText('?');
      expect(fallbacks.length).toBeGreaterThan(0);
    });
  });

  it('calls logout endpoint and redirects to /login on sign out', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        profileResponse(
          'Ada Lovelace',
          'ada@unilag.edu.ng'
        ) as unknown as Response
      )
      .mockResolvedValueOnce({ ok: true } as Response);

    const user = userEvent.setup();
    render(<DashboardHeaderAvatar settingsHref="/settings" />);

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /account menu/i })
      ).toBeInTheDocument()
    );

    await user.click(screen.getByRole('button', { name: /account menu/i }));
    await user.click(screen.getByRole('menuitem', { name: /sign out/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/logout', {
        method: 'POST',
      });
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
  });

  it('settings link points to the settingsHref prop', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      profileResponse(
        'Ada Lovelace',
        'ada@unilag.edu.ng'
      ) as unknown as Response
    );
    const user = userEvent.setup();
    render(<DashboardHeaderAvatar settingsHref="/cso/settings" />);

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /account menu/i })
      ).toBeInTheDocument()
    );

    await user.click(screen.getByRole('button', { name: /account menu/i }));
    expect(screen.getByRole('menuitem', { name: /settings/i })).toHaveAttribute(
      'href',
      '/cso/settings'
    );
  });
});
