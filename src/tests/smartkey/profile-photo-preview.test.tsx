import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProfilePhotoPreview } from '@/components/smartkey/profile-photo-preview';

describe('ProfilePhotoPreview', () => {
  it('renders initials derived from the name when there is no photo', () => {
    render(<ProfilePhotoPreview name="Ada Lovelace" />);
    expect(screen.getByText('AL')).toBeInTheDocument();
  });

  it('disables the button and omits aria-label when there is no photo', () => {
    render(<ProfilePhotoPreview name="Ada Lovelace" />);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).not.toHaveAttribute('aria-label');
  });

  it('enables the button with an aria-label when a photo is present', () => {
    render(
      <ProfilePhotoPreview name="Ada Lovelace" photoUrl="https://x/a.jpg" />
    );
    const button = screen.getByRole('button', {
      name: "View Ada Lovelace's profile photo",
    });
    expect(button).toBeEnabled();
  });

  it('shows the loading placeholder instead of initials when loading', () => {
    render(<ProfilePhotoPreview name="Ada Lovelace" loading />);
    expect(screen.getByText('...')).toBeInTheDocument();
    expect(screen.queryByText('AL')).not.toBeInTheDocument();
  });

  it('opens a dialog with the name and image when the photo button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <ProfilePhotoPreview name="Ada Lovelace" photoUrl="https://x/a.jpg" />
    );
    await user.click(
      screen.getByRole('button', {
        name: "View Ada Lovelace's profile photo",
      })
    );
    expect(
      screen.getByRole('dialog', { name: 'Ada Lovelace' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: "Ada Lovelace's profile photo" })
    ).toHaveAttribute('src', 'https://x/a.jpg');
  });
});
