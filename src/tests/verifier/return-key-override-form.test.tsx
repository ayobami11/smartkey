import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import { ReturnKeyOverrideForm } from '@/app/verifier/_components/return-key-override-form';

const renderWithProviders = (ui: React.ReactElement) =>
  render(<TooltipProvider>{ui}</TooltipProvider>);

const defaultProps = {
  isOffline: false,
  isSubmitting: false,
  serverError: null,
  onSubmit: vi.fn(),
  onSwitchMode: vi.fn(),
};

describe('ReturnKeyOverrideForm', () => {
  it('renders the "Reason for returning without a code" label', () => {
    renderWithProviders(<ReturnKeyOverrideForm {...defaultProps} />);
    expect(
      screen.getByLabelText(/reason for returning without a code/i)
    ).toBeInTheDocument();
  });

  it('renders a textarea for the override reason', () => {
    renderWithProviders(<ReturnKeyOverrideForm {...defaultProps} />);
    expect(
      screen.getByRole('textbox', {
        name: /reason for returning without a code/i,
      })
    ).toBeInTheDocument();
  });

  it('"Enter a code instead" button calls onSwitchMode', async () => {
    const onSwitchMode = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <ReturnKeyOverrideForm {...defaultProps} onSwitchMode={onSwitchMode} />
    );
    await user.click(
      screen.getByRole('button', { name: /enter a code instead/i })
    );
    expect(onSwitchMode).toHaveBeenCalledOnce();
  });

  it('submit button is disabled when isOffline is true', () => {
    renderWithProviders(
      <ReturnKeyOverrideForm {...defaultProps} isOffline={true} />
    );
    expect(
      screen.getByRole('button', { name: /return without code/i })
    ).toBeDisabled();
  });

  it('submit button shows "Marking returned..." and aria-busy when isSubmitting', () => {
    renderWithProviders(
      <ReturnKeyOverrideForm {...defaultProps} isSubmitting={true} />
    );
    const btn = screen.getByRole('button', { name: /marking returned/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });

  it('shows the serverError as a role="alert" element', () => {
    renderWithProviders(
      <ReturnKeyOverrideForm
        {...defaultProps}
        serverError="Failed to mark key as returned."
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Failed to mark key as returned.'
    );
  });

  it('shows a validation error when the reason is too short', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReturnKeyOverrideForm {...defaultProps} />);
    await user.type(
      screen.getByLabelText(/reason for returning without a code/i),
      'ab'
    );
    await user.click(
      screen.getByRole('button', { name: /return without code/i })
    );
    await waitFor(() => {
      expect(screen.getByText(/give a brief reason/i)).toBeInTheDocument();
    });
  });

  it('calls onSubmit with the override reason', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(
      <ReturnKeyOverrideForm {...defaultProps} onSubmit={onSubmit} />
    );
    await user.type(
      screen.getByLabelText(/reason for returning without a code/i),
      'Requester lost their phone.'
    );
    await user.click(
      screen.getByRole('button', { name: /return without code/i })
    );
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('Requester lost their phone.');
    });
  });
});
