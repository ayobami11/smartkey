import { KeyRoundIcon } from 'lucide-react';

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

type Props = { title: string; description: string };

export const KeysEmpty = ({ title, description }: Props) => (
  <Empty className="flex-none border border-border bg-card">
    <EmptyMedia variant="icon">
      <KeyRoundIcon
        className="size-8 text-muted-foreground"
        aria-hidden="true"
      />
    </EmptyMedia>
    <EmptyContent>
      <EmptyTitle>{title}</EmptyTitle>
      <EmptyDescription>{description}</EmptyDescription>
    </EmptyContent>
  </Empty>
);
