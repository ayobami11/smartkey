import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockToastError } = vi.hoisted(() => ({
  mockToastError: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: mockToastError, success: vi.fn() },
}));

import { OnboardingForm } from '@/app/dean/onboarding/_components/onboarding-form';

const makeFile = (name: string, type: string) =>
  new File(['x'], name, { type });

const defaultProps = {
  sigFile: makeFile('sig.png', 'image/png'),
  stampFile: makeFile('stamp.png', 'image/png'),
  onSuccess: vi.fn(),
  onBack: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn();
  // createObjectURL is called at render time (src={URL.createObjectURL(file)})
  // so the mock must be in place before render(), not just before an event.
  global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  global.URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Fills both password fields with a valid matching password and checks the
// confirmation checkbox. Extracted here to avoid repetition in API-path tests.
const fillValidForm = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText(/^password$/i), 'ValidPass1!');
  await user.type(screen.getByLabelText(/confirm password/i), 'ValidPass1!');
  await user.click(screen.getByRole('checkbox'));
};

describe('OnboardingForm', () => {
  it('renders signature and stamp preview images', () => {
    render(<OnboardingForm {...defaultProps} />);
    expect(screen.getByAltText('Signature reference')).toBeInTheDocument();
    expect(screen.getByAltText('Stamp reference')).toBeInTheDocument();
  });

  it('renders the "Finish setup" submit button', () => {
    render(<OnboardingForm {...defaultProps} />);
    expect(
      screen.getByRole('button', { name: /finish setup/i })
    ).toBeInTheDocument();
  });

  it('"Back" button calls onBack', async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<OnboardingForm {...defaultProps} onBack={onBack} />);
    await user.click(screen.getByRole('button', { name: /back/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('show/hide toggle changes the password field type', async () => {
    const user = userEvent.setup();
    render(<OnboardingForm {...defaultProps} />);
    const input = screen.getByLabelText(/^password$/i);
    expect(input).toHaveAttribute('type', 'password');
    // Both toggles start with label "Show password"; first one is for Password
    const [showPasswordBtn] = screen.getAllByRole('button', {
      name: /show password/i,
    });
    await user.click(showPasswordBtn);
    expect(input).toHaveAttribute('type', 'text');
  });

  it('show/hide toggle changes the confirm-password field type independently', async () => {
    const user = userEvent.setup();
    render(<OnboardingForm {...defaultProps} />);
    const input = screen.getByLabelText(/confirm password/i);
    expect(input).toHaveAttribute('type', 'password');
    const showBtns = screen.getAllByRole('button', { name: /show password/i });
    await user.click(showBtns[1]); // second toggle = Confirm password field
    expect(input).toHaveAttribute('type', 'text');
  });

  it('shows "Passwords do not match." when passwords differ', async () => {
    const user = userEvent.setup();
    render(<OnboardingForm {...defaultProps} />);
    await user.type(screen.getByLabelText(/^password$/i), 'ValidPass1!');
    await user.type(
      screen.getByLabelText(/confirm password/i),
      'DifferentPass1!'
    );
    await user.click(screen.getByRole('button', { name: /finish setup/i }));
    await waitFor(() => {
      expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
    });
  });

  it('shows "You must confirm..." when the checkbox is unchecked on submit', async () => {
    const user = userEvent.setup();
    render(<OnboardingForm {...defaultProps} />);
    await user.type(screen.getByLabelText(/^password$/i), 'ValidPass1!');
    await user.type(screen.getByLabelText(/confirm password/i), 'ValidPass1!');
    // Intentionally do not check the confirmation checkbox
    await user.click(screen.getByRole('button', { name: /finish setup/i }));
    await waitFor(() => {
      expect(
        screen.getByText('You must confirm your signature and stamp.')
      ).toBeInTheDocument();
    });
  });

  it('shows "Setting up..." with aria-busy while the API call is in flight', async () => {
    // Never-resolving promise keeps isSubmitting=true for the duration of the test
    vi.mocked(global.fetch).mockImplementationOnce(
      () => new Promise<Response>(() => {})
    );
    const user = userEvent.setup();
    render(<OnboardingForm {...defaultProps} />);
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /finish setup/i }));
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /setting up/i });
      expect(btn).toHaveAttribute('aria-busy', 'true');
    });
  });

  it('calls toast.error with the server message on a failed API response', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Activation token has expired.' }),
    } as Response);
    const user = userEvent.setup();
    render(<OnboardingForm {...defaultProps} />);
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /finish setup/i }));
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        'Activation token has expired.'
      );
    });
  });

  it('calls onSuccess after a successful API response', async () => {
    const onSuccess = vi.fn();
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    } as Response);
    const user = userEvent.setup();
    render(<OnboardingForm {...defaultProps} onSuccess={onSuccess} />);
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /finish setup/i }));
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledOnce();
    });
  });
});
