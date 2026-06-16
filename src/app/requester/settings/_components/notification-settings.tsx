'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';

const notificationItems = [
  {
    id: 'code-email',
    label: 'Collection code generated',
    description:
      'Receive the 6-digit code by email when your request is approved.',
    channel: 'email',
  },
  {
    id: 'key-issued-in-app',
    label: 'Key issued confirmation',
    description:
      'In-app notification when a verifier marks your key as issued.',
    channel: 'in-app',
  },
  {
    id: 'overdue-email',
    label: 'Return deadline reminder',
    description:
      'Email reminder when your key is approaching or past its return deadline.',
    channel: 'email',
  },
  {
    id: 'weekend-decided-email',
    label: 'Weekend request decided',
    description:
      'Email when your HOD approves or declines a weekend access request.',
    channel: 'email',
  },
] as const;

type NotificationId = (typeof notificationItems)[number]['id'];

export const NotificationSettings = () => {
  const [notifications, setNotifications] = useState<
    Record<NotificationId, boolean>
  >({
    'code-email': true,
    'key-issued-in-app': true,
    'overdue-email': true,
    'weekend-decided-email': true,
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
            <div className="min-w-0">
              <Label
                htmlFor={item.id}
                className="cursor-pointer text-sm font-medium text-foreground"
              >
                {item.label}
              </Label>
              <p className="text-xs text-muted-foreground">
                {item.description}
              </p>
              <p className="mt-0.5 text-xs capitalize text-muted-foreground/70">
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

      <p className="max-w-md text-xs text-muted-foreground">
        Email notifications are sent to your institutional email address. You
        cannot disable the collection code email — it is required for key
        collection.
      </p>

      <div>
        <Button>Save notification settings</Button>
      </div>
    </div>
  );
};
