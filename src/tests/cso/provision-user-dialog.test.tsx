import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRefresh, mockToastError } = vi.hoisted(() => ({
  mockRefresh: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock('sonner', () => ({
  toast: { error: mockToastError, success: vi.fn() },
}));

import { ProvisionUserDialog } from '@/app/cso/users/_components/provision-user-dialog';

const units = [
  { id: 'eng', name: 'Engineering', has_hod: false, authoriser: 'DEAN' },
  { id: 'sci', name: 'Science', has_hod: true, authoriser: 'DEAN' },
  { id: 'admin', name: 'Administration', has_hod: false, authoriser: 'CSO' },
];

const unitsResponse = () => ({
  ok: true,
  json: async () => ({ data: { units } }),
});

const jsonResponse = (body: unknown, ok = true, status = ok ? 200 : 422) => ({
  ok,
  status,
  json: async () => body,
});

const openDialog = async () => {
  const user = userEvent.setup();
  render(<ProvisionUserDialog />);
  await user.click(screen.getByRole('button', { name: /provision new user/i }));
  await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  return user;
};

const selectRole = async (
  user: ReturnType<typeof userEvent.setup>,
  roleLabel: RegExp
) => {
  await user.click(screen.getByRole('combobox', { name: /role/i }));
  await user.click(await screen.findByRole('option', { name: roleLabel }));
};

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url === '/api/admin/units') return Promise.resolve(unitsResponse());
    return Promise.resolve(jsonResponse({ data: null, error: 'unhandled' }));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProvisionUserDialog', () => {
  it('opens with the form and no Unit field until a role needing one is picked', async () => {
    await openDialog();
    expect(
      screen.getByRole('heading', { name: /provision new user/i })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/^unit$/i)).not.toBeInTheDocument();
  });

  it('shows the Unit field for DEAN and REQUESTER but not VERIFIER', async () => {
    const user = await openDialog();

    await selectRole(user, /verifier/i);
    expect(screen.queryByLabelText(/^unit$/i)).not.toBeInTheDocument();

    await selectRole(user, /dean/i);
    expect(screen.getByLabelText(/^unit$/i)).toBeInTheDocument();

    await selectRole(user, /requester/i);
    expect(screen.getByLabelText(/^unit$/i)).toBeInTheDocument();
  });

  it('for DEAN: excludes CSO-authoriser units and disables units that already have a Dean', async () => {
    const user = await openDialog();
    await selectRole(user, /dean/i);

    await user.click(screen.getByRole('combobox', { name: /^unit$/i }));

    expect(
      await screen.findByRole('option', { name: 'Engineering' })
    ).toBeEnabled();
    expect(screen.getByRole('option', { name: 'Science' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(
      screen.queryByRole('option', { name: 'Administration' })
    ).not.toBeInTheDocument();
  });

  it('for REQUESTER: includes CSO-authoriser units and does not disable any', async () => {
    const user = await openDialog();
    await selectRole(user, /requester/i);

    await user.click(screen.getByRole('combobox', { name: /^unit$/i }));

    expect(
      await screen.findByRole('option', { name: 'Administration' })
    ).toBeEnabled();
    expect(screen.getByRole('option', { name: 'Science' })).toBeEnabled();
  });

  it('requires full name, email, and role on empty submit', async () => {
    const user = await openDialog();
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(
      await screen.findByText(/full name is required/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/enter a valid email address/i)
    ).toBeInTheDocument();
    // "Select a role" also appears as the Select's placeholder text, so a
    // second match (the field error) confirms the validation message rendered.
    expect(screen.getAllByText(/^select a role$/i)).toHaveLength(2);
  });

  it('requires a unit when the role is DEAN', async () => {
    const user = await openDialog();
    await user.type(screen.getByLabelText(/full name/i), 'Grace Hopper');
    await user.type(
      screen.getByLabelText(/institutional email/i),
      'grace@unilag.edu.ng'
    );
    await selectRole(user, /dean/i);

    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(
      await screen.findByText(/unit is required for this role/i)
    ).toBeInTheDocument();
  });

  it('submits the expected body and shows the success state', async () => {
    const user = await openDialog();
    await user.type(screen.getByLabelText(/full name/i), 'Ada Lovelace');
    await user.type(
      screen.getByLabelText(/institutional email/i),
      'ada@unilag.edu.ng'
    );
    await selectRole(user, /verifier/i);

    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Account created')
    );
    expect(screen.getByRole('status')).toHaveTextContent('Ada Lovelace');
    expect(screen.getByRole('status')).toHaveTextContent('ada@unilag.edu.ng');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/users',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          full_name: 'Ada Lovelace',
          institutional_email: 'ada@unilag.edu.ng',
          role: 'VERIFIER',
          unit_id: undefined,
        }),
      })
    );
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('shows a toast error and stays on the form when the API call fails', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/admin/units') return Promise.resolve(unitsResponse());
      return Promise.resolve(
        jsonResponse(
          { data: null, error: 'Email already registered' },
          false,
          409
        )
      );
    });

    const user = await openDialog();
    await user.type(screen.getByLabelText(/full name/i), 'Ada Lovelace');
    await user.type(
      screen.getByLabelText(/institutional email/i),
      'ada@unilag.edu.ng'
    );
    await selectRole(user, /verifier/i);
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith('Email already registered')
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /provision new user/i })
    ).toBeInTheDocument();
  });

  it('Cancel closes the dialog', async () => {
    const user = await openDialog();
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
  });
});
