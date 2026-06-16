import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';

export const OperationalSettings = () => (
  <div className="flex flex-col gap-6">
    <div>
      <h2 className="text-base font-semibold text-foreground">Operational</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Configure access hours, return deadlines, and code expiry per zone.
      </p>
    </div>

    <Separator />

    {/* Zone hours */}
    {(['New Senate', 'Old Senate'] as const).map((zone) => (
      <div
        key={zone}
        className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5"
      >
        <h3 className="text-sm font-semibold text-foreground">{zone}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium text-muted-foreground">
              Weekday hours
            </p>
            <div className="flex items-center gap-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${zone}-weekday-from`} className="text-xs">
                  From
                </Label>
                <Input
                  id={`${zone}-weekday-from`}
                  type="time"
                  defaultValue="06:00"
                  className="w-32"
                />
              </div>
              <span className="mt-5 text-muted-foreground">–</span>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${zone}-weekday-to`} className="text-xs">
                  To
                </Label>
                <Input
                  id={`${zone}-weekday-to`}
                  type="time"
                  defaultValue="22:00"
                  className="w-32"
                />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">
                Weekend hours
              </p>
              <div className="flex items-center gap-2">
                <Label
                  htmlFor={`${zone}-weekend-closed`}
                  className="text-xs text-muted-foreground"
                >
                  Closed
                </Label>
                <Switch id={`${zone}-weekend-closed`} defaultChecked={true} />
              </div>
            </div>
            <div className="flex items-center gap-2 opacity-40">
              <div className="flex flex-col gap-1">
                <Label className="text-xs">From</Label>
                <Input
                  type="time"
                  defaultValue="08:00"
                  className="w-32"
                  disabled
                />
              </div>
              <span className="mt-5 text-muted-foreground">–</span>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">To</Label>
                <Input
                  type="time"
                  defaultValue="18:00"
                  className="w-32"
                  disabled
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    ))}

    <div className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="return-deadline">Return deadline</Label>
        <select
          id="return-deadline"
          defaultValue="17:00"
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <option value="17:00">End of business day (17:00)</option>
          <option value="18:00">18:00</option>
          <option value="custom">Custom</option>
        </select>
        <p className="text-xs text-muted-foreground">
          Default deadline for all key returns.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="code-expiry">Code expiry (minutes)</Label>
        <Input
          id="code-expiry"
          type="number"
          defaultValue={10}
          min={5}
          max={60}
          className="w-full"
        />
        <p className="text-xs text-muted-foreground">
          Minutes after generation before a verification code expires.
        </p>
      </div>
    </div>

    <div>
      <Button>Save operational settings</Button>
    </div>
  </div>
);
