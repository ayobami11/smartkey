'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';

const notificationItems = [
  {
    id: 'weekend-in-app',
    label: 'Weekend requests submitted',
    channel: 'in-app',
  },
  {
    id: 'weekend-email',
    label: 'Weekend requests submitted',
    channel: 'email',
  },
  {
    id: 'digest-email',
    label: "Daily digest of your department's activity",
    channel: 'email',
  },
] as const;

type NotificationId = (typeof notificationItems)[number]['id'];

export const NotificationSettings = () => {
  const [notifications, setNotifications] = useState<
    Record<NotificationId, boolean>
  >({
    'weekend-in-app': true,
    'weekend-email': true,
    'digest-email': false,
  });

  const toggleNotification = (id: NotificationId) => {
    setNotifications((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">
          Notifications
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Choose which events trigger in-app and email alerts.
        </p>
      </div>

      <Separator />

      <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card shadow-[0_2px_4px_rgba(15,23,42,0.06)]">
        {notificationItems.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-4 px-4 py-4"
          >
            <div>
              <Label
                htmlFor={item.id}
                className="cursor-pointer text-sm font-medium text-foreground"
              >
                {item.label}
              </Label>
              <p className="text-xs capitalize text-muted-foreground">
                {item.channel}
              </p>
            </div>
            <Switch
              id={item.id}
              checked={notifications[item.id]}
              onCheckedChange={() => toggleNotification(item.id)}
              aria-label={`${item.label} (${item.channel})`}
            />
          </div>
        ))}
      </div>

      <div>
        <Button>Save notification settings</Button>
      </div>
    </div>
  );
};
