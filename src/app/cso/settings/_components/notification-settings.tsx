import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';

const notificationToggles = [
  { id: 'anomaly_inapp', label: 'Anomaly alerts (in-app)', enabled: true },
  { id: 'anomaly_email', label: 'Anomaly alerts (email)', enabled: true },
  {
    id: 'signature_email',
    label: 'Signature mismatches (email)',
    enabled: true,
  },
  { id: 'daily_digest', label: 'Daily digest at 08:00', enabled: false },
];

export const NotificationSettings = () => (
  <div className="flex flex-col gap-6">
    <div>
      <h2 className="text-base font-semibold text-foreground">Notifications</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Choose which events trigger in-app and email alerts.
      </p>
    </div>

    <Separator />

    <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
      {notificationToggles.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between px-5 py-4"
        >
          <Label
            htmlFor={item.id}
            className="cursor-pointer text-sm font-normal text-foreground"
          >
            {item.label}
          </Label>
          <Switch id={item.id} defaultChecked={item.enabled} />
        </div>
      ))}
    </div>

    <div>
      <Button>Save notification settings</Button>
    </div>
  </div>
);
