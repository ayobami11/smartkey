import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';

const riskRules = [
  {
    id: 'outside_hours',
    name: 'Outside operational hours',
    description: "Request submitted outside the zone's permitted hours.",
    weight: 3,
    enabled: true,
  },
  {
    id: 'outstanding_key',
    name: 'Outstanding key not returned',
    description: 'Requester has an unreturned key from a previous request.',
    weight: 5,
    enabled: true,
  },
  {
    id: 'weekend_no_memo',
    name: 'Weekend without HOD memo',
    description: 'Weekend request without an HOD-approved memo on file.',
    weight: 4,
    enabled: true,
  },
  {
    id: 'excess_frequency',
    name: 'Excess request frequency',
    description:
      'More than the configured number of requests in a rolling 24-hour window.',
    weight: 2,
    enabled: true,
  },
  {
    id: 'not_whitelisted',
    name: 'Collector not whitelisted',
    description: "Requester is not in the key's authorised collector list.",
    weight: 5,
    enabled: true,
  },
];

export const RiskRulesSettings = () => (
  <div className="flex flex-col gap-6">
    <div>
      <h2 className="text-base font-semibold text-foreground">Risk rules</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Adjust rule weights and tier thresholds. Changes apply to new requests
        only.
      </p>
    </div>

    <Separator />

    <div className="rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">
              Rule
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">
              Weight (1–10)
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">
              Enabled
            </th>
          </tr>
        </thead>
        <tbody>
          {riskRules.map((rule, idx) => (
            <tr
              key={rule.id}
              className={
                idx !== riskRules.length - 1 ? 'border-b border-border' : ''
              }
            >
              <td className="px-4 py-3">
                <p className="font-medium text-foreground">{rule.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {rule.description}
                </p>
              </td>
              <td className="px-4 py-3">
                <Input
                  type="number"
                  defaultValue={rule.weight}
                  min={1}
                  max={10}
                  className="w-20"
                  aria-label={`Weight for ${rule.name}`}
                />
              </td>
              <td className="px-4 py-3">
                <Switch
                  id={rule.id}
                  defaultChecked={rule.enabled}
                  aria-label={`Enable ${rule.name}`}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground">Tier thresholds</h3>
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tier-low" className="text-xs">
            Low ≤
          </Label>
          <Input
            id="tier-low"
            type="number"
            defaultValue={3}
            min={1}
            className="w-20"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tier-medium" className="text-xs">
            Medium ≤
          </Label>
          <Input
            id="tier-medium"
            type="number"
            defaultValue={6}
            min={1}
            className="w-20"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">High &gt;</Label>
          <div className="flex h-9 w-20 items-center rounded-md border border-border bg-muted px-3 text-sm text-muted-foreground">
            6
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Changes apply to new requests only. Existing risk scores are not
        retroactively updated.
      </p>
    </div>

    <div>
      <Button>Save risk rules</Button>
    </div>
  </div>
);
