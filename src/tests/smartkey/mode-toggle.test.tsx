import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { mockSetTheme, mockUseTheme } = vi.hoisted(() => ({
  mockSetTheme: vi.fn(),
  mockUseTheme: vi.fn(),
}));

vi.mock('next-themes', () => ({
  useTheme: mockUseTheme,
}));

import { ModeToggle } from '@/components/smartkey/mode-toggle';

describe('ModeToggle', () => {
  it('renders the three theme toggle buttons with correct aria-labels', () => {
    mockUseTheme.mockReturnValue({ theme: 'light', setTheme: mockSetTheme });
    render(<ModeToggle />);
    expect(
      screen.getByRole('radio', { name: /system theme/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: /light theme/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: /dark theme/i })
    ).toBeInTheDocument();
  });

  it('marks the current theme as pressed', () => {
    mockUseTheme.mockReturnValue({ theme: 'dark', setTheme: mockSetTheme });
    render(<ModeToggle />);
    expect(screen.getByRole('radio', { name: /dark theme/i })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('radio', { name: /light theme/i })).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });

  it('calls setTheme with the selected value when a button is clicked', async () => {
    mockUseTheme.mockReturnValue({ theme: 'light', setTheme: mockSetTheme });
    const user = userEvent.setup();
    render(<ModeToggle />);
    await user.click(screen.getByRole('radio', { name: /dark theme/i }));
    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });
});
