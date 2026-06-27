import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { RiskFactor } from '@/lib/ai/risk/types';
import { RiskFactorPopover } from '@/components/smartkey/risk-factor-popover';

const factors: RiskFactor[] = [
  {
    rule: 'outside_operational_hours',
    description: 'Outside operational hours',
    weight: 3,
  },
  {
    rule: 'excess_request_frequency',
    description: 'Too many requests in the last 24 hours',
    weight: 2,
  },
];

const trigger = <button type="button">View factors</button>;

describe('RiskFactorPopover', () => {
  it('renders the trigger element', () => {
    render(<RiskFactorPopover factors={factors} trigger={trigger} />);
    expect(
      screen.getByRole('button', { name: /view factors/i })
    ).toBeInTheDocument();
  });

  it('popover content is not visible before the trigger is clicked', () => {
    render(<RiskFactorPopover factors={factors} trigger={trigger} />);
    expect(
      screen.queryByText('Outside operational hours')
    ).not.toBeInTheDocument();
  });

  it('shows all factors after clicking the trigger', async () => {
    const user = userEvent.setup();
    render(<RiskFactorPopover factors={factors} trigger={trigger} />);
    await user.click(screen.getByRole('button', { name: /view factors/i }));
    expect(screen.getByText('Outside operational hours')).toBeInTheDocument();
    expect(
      screen.getByText('Too many requests in the last 24 hours')
    ).toBeInTheDocument();
  });

  it('shows each factor weight after opening', async () => {
    const user = userEvent.setup();
    render(<RiskFactorPopover factors={factors} trigger={trigger} />);
    await user.click(screen.getByRole('button', { name: /view factors/i }));
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows "no risk factors" message when factors list is empty', async () => {
    const user = userEvent.setup();
    render(<RiskFactorPopover factors={[]} trigger={trigger} />);
    await user.click(screen.getByRole('button', { name: /view factors/i }));
    expect(screen.getByText(/no risk factors identified/i)).toBeInTheDocument();
  });

  it('popover content has aria-label="Risk factors"', async () => {
    const user = userEvent.setup();
    render(<RiskFactorPopover factors={factors} trigger={trigger} />);
    await user.click(screen.getByRole('button', { name: /view factors/i }));
    expect(
      document.querySelector('[aria-label="Risk factors"]')
    ).toBeInTheDocument();
  });

  it('closes the popover when Escape is pressed', async () => {
    const user = userEvent.setup();
    render(<RiskFactorPopover factors={factors} trigger={trigger} />);
    await user.click(screen.getByRole('button', { name: /view factors/i }));
    expect(screen.getByText('Outside operational hours')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(
      screen.queryByText('Outside operational hours')
    ).not.toBeInTheDocument();
  });
});
