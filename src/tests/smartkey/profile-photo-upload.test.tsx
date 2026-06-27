import userEvent from '@testing-library/user-event';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}));

import { ProfilePhotoUpload } from '@/components/smartkey/profile-photo-upload';

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn();
  global.URL.createObjectURL = vi.fn(() => 'blob:mock-preview-url');
  global.URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const makeFile = (name: string, type: string, sizeBytes?: number) => {
  const file = new File(['x'], name, { type });
  if (sizeBytes !== undefined) {
    Object.defineProperty(file, 'size', { value: sizeBytes });
  }
  return file;
};

// happy-dom doesn't support DataTransfer used by userEvent.upload;
// set files directly and fire the change event instead.
const selectFile = (input: HTMLElement, file: File) => {
  Object.defineProperty(input, 'files', {
    value: [file],
    configurable: true,
  });
  fireEvent.change(input);
};

describe('ProfilePhotoUpload', () => {
  it('renders the skeleton when loading=true', () => {
    render(<ProfilePhotoUpload name="Ada Lovelace" loading={true} />);
    expect(
      screen.queryByRole('button', { name: /upload photo/i })
    ).not.toBeInTheDocument();
  });

  it('renders the "Upload photo" button when not loading', () => {
    render(<ProfilePhotoUpload name="Ada Lovelace" />);
    expect(
      screen.getByRole('button', { name: /upload photo/i })
    ).toBeInTheDocument();
  });

  it('does not show "Remove photo" when no initialUrl is provided', () => {
    render(<ProfilePhotoUpload name="Ada Lovelace" />);
    expect(
      screen.queryByRole('button', { name: /remove photo/i })
    ).not.toBeInTheDocument();
  });

  it('shows "Remove photo" button when initialUrl is provided', () => {
    render(
      <ProfilePhotoUpload
        name="Ada Lovelace"
        initialUrl="https://example.com/photo.jpg"
      />
    );
    expect(
      screen.getByRole('button', { name: /remove photo/i })
    ).toBeInTheDocument();
  });

  it('shows an error when a non-image file is selected', async () => {
    render(<ProfilePhotoUpload name="Ada Lovelace" />);
    selectFile(
      screen.getByLabelText('Upload profile photo'),
      makeFile('doc.pdf', 'application/pdf')
    );
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'File must be an image.'
      );
    });
  });

  it('shows an error when the file exceeds 2 MB', async () => {
    render(<ProfilePhotoUpload name="Ada Lovelace" />);
    selectFile(
      screen.getByLabelText('Upload profile photo'),
      makeFile('big.jpg', 'image/jpeg', 3 * 1024 * 1024)
    );
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Photo must be under 2 MB.'
      );
    });
  });

  it('shows "Save photo" and "Cancel" buttons after a valid file is selected', async () => {
    render(<ProfilePhotoUpload name="Ada Lovelace" />);
    selectFile(
      screen.getByLabelText('Upload profile photo'),
      makeFile('photo.jpg', 'image/jpeg')
    );
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /save photo/i })
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole('button', { name: /cancel photo selection/i })
    ).toBeInTheDocument();
  });

  it('returns to the "Upload photo" state when Cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<ProfilePhotoUpload name="Ada Lovelace" />);
    selectFile(
      screen.getByLabelText('Upload profile photo'),
      makeFile('photo.jpg', 'image/jpeg')
    );
    await waitFor(() =>
      screen.getByRole('button', { name: /cancel photo selection/i })
    );
    await user.click(
      screen.getByRole('button', { name: /cancel photo selection/i })
    );
    expect(
      screen.getByRole('button', { name: /upload photo/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /save photo/i })
    ).not.toBeInTheDocument();
  });

  it('calls POST /api/profile/photo and shows toast.success on a successful save', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { photo_url: 'https://example.com/new-photo.jpg' },
      }),
    } as Response);
    const user = userEvent.setup();
    render(<ProfilePhotoUpload name="Ada Lovelace" />);
    selectFile(
      screen.getByLabelText('Upload profile photo'),
      makeFile('photo.jpg', 'image/jpeg')
    );
    await waitFor(() => screen.getByRole('button', { name: /save photo/i }));
    await user.click(screen.getByRole('button', { name: /save photo/i }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/profile/photo',
        expect.objectContaining({ method: 'POST' })
      );
      expect(mockToastSuccess).toHaveBeenCalledWith(
        'Profile photo updated successfully.'
      );
    });
  });

  it('shows toast.error when the upload API returns a non-ok response', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Upload failed. Try again.' }),
    } as Response);
    const user = userEvent.setup();
    render(<ProfilePhotoUpload name="Ada Lovelace" />);
    selectFile(
      screen.getByLabelText('Upload profile photo'),
      makeFile('photo.jpg', 'image/jpeg')
    );
    await waitFor(() => screen.getByRole('button', { name: /save photo/i }));
    await user.click(screen.getByRole('button', { name: /save photo/i }));
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Upload failed. Try again.');
    });
  });

  it('opens a confirmation dialog when "Remove photo" is clicked', async () => {
    const user = userEvent.setup();
    render(
      <ProfilePhotoUpload
        name="Ada Lovelace"
        initialUrl="https://example.com/photo.jpg"
      />
    );
    await user.click(screen.getByRole('button', { name: /remove photo/i }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('Remove profile photo?')).toBeInTheDocument();
  });

  it('calls DELETE /api/profile/photo and shows toast.success on confirmed remove', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    } as Response);
    const user = userEvent.setup();
    render(
      <ProfilePhotoUpload
        name="Ada Lovelace"
        initialUrl="https://example.com/photo.jpg"
      />
    );
    await user.click(screen.getByRole('button', { name: /remove photo/i }));
    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/profile/photo', {
        method: 'DELETE',
      });
      expect(mockToastSuccess).toHaveBeenCalledWith(
        'Profile photo removed successfully.'
      );
    });
  });
});
