import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import { ReturnKeyForm } from '@/app/verifier/_components/return-key-form';

// Both return-key forms use Tooltip for the offline disabled-button hint,
// which requires TooltipProvider to be present in the tree.
const renderWithProviders = (ui: React.ReactElement) =>
  render(<TooltipProvider>{ui}</TooltipProvider>);

const defaultProps = {
  requesterName: 'Dr. Bakare',
  isOffline: false,
  isSubmitting: false,
  serverError: null,
  onSubmit: vi.fn(),
  onSwitchMode: vi.fn(),
};

describe('ReturnKeyForm', () => {
  it('renders the "Return code" label', () => {
    renderWithProviders(<ReturnKeyForm {...defaultProps} />);
    expect(screen.getByLabelText(/return code/i)).toBeInTheDocument();
  });

  it('shows the requester name in the instruction text', () => {
    renderWithProviders(<ReturnKeyForm {...defaultProps} />);
    expect(screen.getByText(/dr\. bakare/i)).toBeInTheDocument();
  });

  it('renders all 6 OTP slots', () => {
    const { container } = renderWithProviders(
      <ReturnKeyForm {...defaultProps} />
    );
    const slots = container.querySelectorAll('[data-slot="input-otp-slot"]');
    expect(slots.length).toBe(6);
  });

  it('"Requester can\'t provide a code?" button calls onSwitchMode', async () => {
    const onSwitchMode = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <ReturnKeyForm {...defaultProps} onSwitchMode={onSwitchMode} />
    );
    // The component uses &rsquo; (U+2019 right single quote) not a plain apostrophe
    await user.click(
      screen.getByRole('button', { name: /requester can.t provide a code/i })
    );
    expect(onSwitchMode).toHaveBeenCalledOnce();
  });

  it('submit button is disabled when isOffline is true', () => {
    renderWithProviders(<ReturnKeyForm {...defaultProps} isOffline={true} />);
    expect(
      screen.getByRole('button', { name: /confirm return/i })
    ).toBeDisabled();
  });

  it('submit button shows "Marking returned..." and aria-busy when isSubmitting', () => {
    renderWithProviders(
      <ReturnKeyForm {...defaultProps} isSubmitting={true} />
    );
    const btn = screen.getByRole('button', { name: /marking returned/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });

  it('shows the serverError as a role="alert" element', () => {
    renderWithProviders(
      <ReturnKeyForm
        {...defaultProps}
        serverError="Return code not recognised or expired."
      />
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Return code not recognised or expired.');
  });

  it('calls onSubmit with the entered 6-digit code', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(
      <ReturnKeyForm {...defaultProps} onSubmit={onSubmit} />
    );
    await user.type(screen.getByLabelText(/return code/i), '654321');
    await user.click(screen.getByRole('button', { name: /confirm return/i }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('654321');
    });
  });

  it('shows a validation error when fewer than 6 digits are submitted', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReturnKeyForm {...defaultProps} />);
    await user.type(screen.getByLabelText(/return code/i), '123');
    await user.click(screen.getByRole('button', { name: /confirm return/i }));
    await waitFor(() => {
      expect(
        screen.getByText(/enter the 6-digit return code/i)
      ).toBeInTheDocument();
    });
  });
});
