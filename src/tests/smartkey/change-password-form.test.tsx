import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}));

import { ChangePasswordForm } from '@/components/smartkey/change-password-form';

// A password that satisfies all constraints in src/lib/validation/primitives.ts
const VALID_PASSWORD = 'Test@123456!';

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ChangePasswordForm', () => {
  it('renders all three password fields', () => {
    render(<ChangePasswordForm />);
    expect(screen.getByLabelText('Current password')).toBeInTheDocument();
    expect(screen.getByLabelText('New password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm new password')).toBeInTheDocument();
  });

  it('all password inputs start as type="password"', () => {
    render(<ChangePasswordForm />);
    expect(screen.getByLabelText('Current password')).toHaveAttribute(
      'type',
      'password'
    );
    expect(screen.getByLabelText('New password')).toHaveAttribute(
      'type',
      'password'
    );
    expect(screen.getByLabelText('Confirm new password')).toHaveAttribute(
      'type',
      'password'
    );
  });

  it('show/hide toggle on current password field reveals the value', async () => {
    const user = userEvent.setup();
    render(<ChangePasswordForm />);
    const input = screen.getByLabelText('Current password');
    expect(input).toHaveAttribute('type', 'password');
    await user.click(
      screen.getAllByRole('button', { name: /show password/i })[0]
    );
    expect(input).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: /hide password/i }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('submit button is rendered with correct label', () => {
    render(<ChangePasswordForm />);
    expect(
      screen.getByRole('button', { name: /update password/i })
    ).toBeInTheDocument();
  });

  it('shows validation error when current password is empty', async () => {
    const user = userEvent.setup();
    render(<ChangePasswordForm />);
    await user.click(screen.getByRole('button', { name: /update password/i }));
    await waitFor(() => {
      expect(
        screen.getByText('Current password is required.')
      ).toBeInTheDocument();
    });
  });

  it('shows error when passwords do not match', async () => {
    const user = userEvent.setup();
    render(<ChangePasswordForm />);
    await user.type(screen.getByLabelText('Current password'), 'oldpass');
    await user.type(screen.getByLabelText('New password'), VALID_PASSWORD);
    await user.type(
      screen.getByLabelText('Confirm new password'),
      'DifferentPass@99!'
    );
    await user.click(screen.getByRole('button', { name: /update password/i }));
    await waitFor(() => {
      expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
    });
  });

  it('submit button has aria-busy while submitting', async () => {
    // Keep fetch pending so the form stays in submitting state
    vi.mocked(global.fetch).mockReturnValueOnce(new Promise<never>(() => {}));
    const user = userEvent.setup();
    render(<ChangePasswordForm />);
    await user.type(screen.getByLabelText('Current password'), 'oldpass');
    await user.type(screen.getByLabelText('New password'), VALID_PASSWORD);
    await user.type(
      screen.getByLabelText('Confirm new password'),
      VALID_PASSWORD
    );
    await user.click(screen.getByRole('button', { name: /update password/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /updating/i })).toHaveAttribute(
        'aria-busy',
        'true'
      );
    });
  });

  it('calls toast.success and resets the form on success', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    } as Response);
    const user = userEvent.setup();
    render(<ChangePasswordForm />);
    await user.type(screen.getByLabelText('Current password'), 'oldpass');
    await user.type(screen.getByLabelText('New password'), VALID_PASSWORD);
    await user.type(
      screen.getByLabelText('Confirm new password'),
      VALID_PASSWORD
    );
    await user.click(screen.getByRole('button', { name: /update password/i }));
    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith(
        'Password updated successfully.'
      );
    });
    // Form resets — inputs should be empty again
    expect(screen.getByLabelText('Current password')).toHaveValue('');
  });

  it('calls toast.error when the API returns a non-ok response', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Incorrect current password.' }),
    } as Response);
    const user = userEvent.setup();
    render(<ChangePasswordForm />);
    await user.type(screen.getByLabelText('Current password'), 'wrongpass');
    await user.type(screen.getByLabelText('New password'), VALID_PASSWORD);
    await user.type(
      screen.getByLabelText('Confirm new password'),
      VALID_PASSWORD
    );
    await user.click(screen.getByRole('button', { name: /update password/i }));
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        'Incorrect current password.'
      );
    });
  });

  it('calls toast.error on a network failure', async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'));
    const user = userEvent.setup();
    render(<ChangePasswordForm />);
    await user.type(screen.getByLabelText('Current password'), 'oldpass');
    await user.type(screen.getByLabelText('New password'), VALID_PASSWORD);
    await user.type(
      screen.getByLabelText('Confirm new password'),
      VALID_PASSWORD
    );
    await user.click(screen.getByRole('button', { name: /update password/i }));
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        'Network error. Check your connection and try again.'
      );
    });
  });
});
