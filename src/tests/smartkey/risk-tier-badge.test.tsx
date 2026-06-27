import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { RiskFactor } from '@/lib/ai/risk/types';
import {
  RiskAcknowledgement,
  RiskTierBadge,
} from '@/components/smartkey/risk-tier-badge';

const noFactors: RiskFactor[] = [];

const factors: RiskFactor[] = [
  {
    rule: 'outside_operational_hours',
    description: 'Outside operational hours',
    weight: 3,
  },
  {
    rule: 'collector_not_whitelisted',
    description: 'Collector not on the authorised list',
    weight: 5,
  },
];

describe('RiskTierBadge', () => {
  it.each([
    ['LOW', 'Low risk'],
    ['MEDIUM', 'Medium risk'],
    ['HIGH', 'High risk'],
  ] as const)('renders %s tier with correct text label', (tier, label) => {
    render(<RiskTierBadge tier={tier} factors={noFactors} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('badge span has aria-label describing the tier', () => {
    render(<RiskTierBadge tier="HIGH" factors={noFactors} />);
    expect(screen.getByLabelText('high risk')).toBeInTheDocument();
  });

  it('tier icon is aria-hidden', () => {
    const { container } = render(
      <RiskTierBadge tier="LOW" factors={noFactors} />
    );
    const svgs = container.querySelectorAll('svg[aria-hidden="true"]');
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('does not render "View factors" button when factors list is empty', () => {
    render(<RiskTierBadge tier="LOW" factors={noFactors} />);
    expect(
      screen.queryByRole('button', { name: /view factors/i })
    ).not.toBeInTheDocument();
  });

  it('renders "View factors" button when factors are present', () => {
    render(<RiskTierBadge tier="HIGH" factors={factors} />);
    expect(
      screen.getByRole('button', { name: /view factors/i })
    ).toBeInTheDocument();
  });
});

describe('RiskAcknowledgement', () => {
  it('renders the acknowledgement checkbox and label', () => {
    render(
      <RiskAcknowledgement acknowledged={false} onAcknowledge={() => {}} />
    );
    expect(
      screen.getByRole('checkbox', {
        name: /reviewed the contributing factors/i,
      })
    ).toBeInTheDocument();
  });

  it('checkbox reflects the acknowledged prop', () => {
    render(
      <RiskAcknowledgement acknowledged={true} onAcknowledge={() => {}} />
    );
    expect(
      screen.getByRole('checkbox', {
        name: /reviewed the contributing factors/i,
      })
    ).toBeChecked();
  });

  it('calls onAcknowledge when clicked', async () => {
    const onAcknowledge = vi.fn();
    render(
      <RiskAcknowledgement acknowledged={false} onAcknowledge={onAcknowledge} />
    );
    await userEvent.click(
      screen.getByRole('checkbox', {
        name: /reviewed the contributing factors/i,
      })
    );
    expect(onAcknowledge).toHaveBeenCalledWith(true);
  });
});
