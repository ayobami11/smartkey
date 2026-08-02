import userEvent from '@testing-library/user-event';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { UsersDataTable } from '@/app/cso/users/_components/data-table';
import type { UserRow } from '@/app/cso/users/_components/columns';

const baseUsers: UserRow[] = [
  {
    id: 'u-1',
    full_name: 'Ada Lovelace',
    institutional_email: 'ada@unilag.edu.ng',
    role: 'CSO',
    department: undefined,
    status: 'ACTIVE',
    last_sign_in_at: '2026-06-01T09:00:00.000Z',
  },
  {
    id: 'u-2',
    full_name: 'Grace Hopper',
    institutional_email: 'grace@unilag.edu.ng',
    role: 'DEAN',
    department: 'Engineering',
    status: 'ACTIVE',
    last_sign_in_at: null,
  },
  {
    id: 'u-3',
    full_name: 'Alan Turing',
    institutional_email: 'alan@unilag.edu.ng',
    role: 'REQUESTER',
    department: 'Science',
    status: 'PENDING_ACTIVATION',
    last_sign_in_at: null,
  },
];

const callbacks = () => ({
  onEdit: vi.fn(),
  onRevoke: vi.fn(),
  onResend: vi.fn(),
  resendingId: null,
});

describe('UsersDataTable', () => {
  it('renders one row per user', () => {
    render(<UsersDataTable data={baseUsers} {...callbacks()} />);
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByText('Alan Turing')).toBeInTheDocument();
  });

  it('shows the empty-state message when no users match', () => {
    render(<UsersDataTable data={[]} {...callbacks()} />);
    expect(
      screen.getByText('No users match the current filters.')
    ).toBeInTheDocument();
  });

  it('filters by the global search box across name and email', async () => {
    const user = userEvent.setup();
    render(<UsersDataTable data={baseUsers} {...callbacks()} />);

    await user.type(screen.getByLabelText('Search users'), 'grace');

    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
    expect(screen.queryByText('Alan Turing')).not.toBeInTheDocument();
  });

  it('filters by role via the Role dropdown', async () => {
    const user = userEvent.setup();
    render(<UsersDataTable data={baseUsers} {...callbacks()} />);

    await user.click(screen.getByRole('button', { name: /^role/i }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: /dean/i }));

    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
    expect(screen.queryByText('Alan Turing')).not.toBeInTheDocument();
  });

  it('filters by status via the Status dropdown', async () => {
    const user = userEvent.setup();
    render(<UsersDataTable data={baseUsers} {...callbacks()} />);

    await user.click(screen.getByRole('button', { name: /^status/i }));
    await user.click(
      screen.getByRole('menuitemcheckbox', { name: /pending activation/i })
    );

    expect(screen.getByText('Alan Turing')).toBeInTheDocument();
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
    expect(screen.queryByText('Grace Hopper')).not.toBeInTheDocument();
  });

  it('"Clear filter" removes an active role filter', async () => {
    const user = userEvent.setup();
    render(<UsersDataTable data={baseUsers} {...callbacks()} />);

    await user.click(screen.getByRole('button', { name: /^role/i }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: /dean/i }));
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^role/i }));
    await user.click(screen.getByRole('menuitem', { name: /clear filter/i }));

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('shows "—" for a null department and "Never signed in" aria-label for a null last sign-in', () => {
    render(<UsersDataTable data={baseUsers} {...callbacks()} />);
    const graceRow = screen.getByText('Grace Hopper').closest('tr')!;
    expect(
      within(graceRow).getByLabelText('Never signed in')
    ).toBeInTheDocument();

    const adaRow = screen.getByText('Ada Lovelace').closest('tr')!;
    expect(within(adaRow).getByText('—')).toBeInTheDocument();
  });

  it('only offers "Resend invite" for a PENDING_ACTIVATION user', async () => {
    const user = userEvent.setup();
    render(<UsersDataTable data={baseUsers} {...callbacks()} />);

    await user.click(
      screen.getByRole('button', { name: /more actions for alan turing/i })
    );
    expect(
      screen.getByRole('menuitem', { name: /resend invite/i })
    ).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await user.click(
      screen.getByRole('button', { name: /more actions for ada lovelace/i })
    );
    expect(
      screen.queryByRole('menuitem', { name: /resend invite/i })
    ).not.toBeInTheDocument();
  });

  it('calls onRevoke/onEdit with the row user when an action is clicked', async () => {
    const user = userEvent.setup();
    const cbs = callbacks();
    render(<UsersDataTable data={baseUsers} {...cbs} />);

    await user.click(
      screen.getByRole('button', { name: /more actions for ada lovelace/i })
    );
    await user.click(screen.getByRole('menuitem', { name: /revoke access/i }));
    expect(cbs.onRevoke).toHaveBeenCalledWith(baseUsers[0]);

    await user.click(
      screen.getByRole('button', { name: /more actions for grace hopper/i })
    );
    await user.click(screen.getByRole('menuitem', { name: /edit details/i }));
    expect(cbs.onEdit).toHaveBeenCalledWith(baseUsers[1]);
  });

  it('resets to page 1 when a filter is applied', async () => {
    const manyUsers: UserRow[] = Array.from({ length: 15 }, (_, i) => ({
      id: `u-${i}`,
      full_name: `User ${i}`,
      institutional_email: `user${i}@unilag.edu.ng`,
      role: i === 14 ? 'DEAN' : 'REQUESTER',
      department: undefined,
      status: 'ACTIVE',
      last_sign_in_at: null,
    }));

    const user = userEvent.setup();
    render(<UsersDataTable data={manyUsers} {...callbacks()} />);

    // Move to page 2 first.
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(screen.getByText(/page 2 of 2/i)).toBeInTheDocument();

    // Applying a filter (only 1 DEAN, out of 15) must snap back to page 1.
    await user.click(screen.getByRole('button', { name: /^role/i }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: /dean/i }));

    expect(screen.getByText(/page 1 of 1/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^next$/i })).toBeDisabled();
  });

  it('Previous is disabled on the first page and enables Next when there is a second page', async () => {
    const manyUsers: UserRow[] = Array.from({ length: 12 }, (_, i) => ({
      id: `u-${i}`,
      full_name: `User ${i}`,
      institutional_email: `user${i}@unilag.edu.ng`,
      role: 'REQUESTER',
      department: undefined,
      status: 'ACTIVE',
      last_sign_in_at: null,
    }));

    render(<UsersDataTable data={manyUsers} {...callbacks()} />);

    expect(screen.getByRole('button', { name: /^previous$/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^next$/i })).toBeEnabled();
    expect(screen.getByText(/page 1 of 2/i)).toBeInTheDocument();
  });
});
