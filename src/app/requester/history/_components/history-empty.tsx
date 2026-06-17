import { HistoryIcon } from 'lucide-react';

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

export const HistoryEmpty = () => (
  <Empty className="border border-border bg-card">
    <EmptyMedia variant="icon">
      <HistoryIcon
        className="size-8 text-muted-foreground"
        aria-hidden="true"
      />
    </EmptyMedia>
    <EmptyContent>
      <EmptyTitle>No requests yet</EmptyTitle>
      <EmptyDescription>
        You have not requested a key yet. Your request history will appear here.
      </EmptyDescription>
    </EmptyContent>
  </Empty>
);
