import { FileTextIcon } from 'lucide-react';

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

export const ReportsEmpty = () => {
  return (
    <Empty className="flex-none border border-border bg-card">
      <EmptyMedia variant="icon">
        <FileTextIcon
          className="size-8 text-muted-foreground"
          aria-hidden="true"
        />
      </EmptyMedia>
      <EmptyContent>
        <EmptyTitle>No shift reports yet</EmptyTitle>
        <EmptyDescription>
          Generate your first shift report to see it here.
        </EmptyDescription>
      </EmptyContent>
    </Empty>
  );
};
