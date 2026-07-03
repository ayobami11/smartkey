import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type SectionCardHeaderProps = {
  title: string;
  count?: number;
  /** Used for the badge's aria-label, e.g. "pending" — defaults to the title. */
  countLabel?: string;
  /** primary = needs a CSO decision; neutral = informational / link-out. */
  badgeVariant?: 'primary' | 'neutral';
  viewAllHref?: string;
};

export const SectionCardHeader = ({
  title,
  count,
  countLabel,
  badgeVariant = 'neutral',
  viewAllHref,
}: SectionCardHeaderProps) => {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold text-foreground">
        {title}
        {!!count && count > 0 && (
          <Badge
            variant={badgeVariant === 'primary' ? 'default' : 'secondary'}
            className="ml-2"
            aria-label={`${count} ${countLabel ?? title.toLowerCase()}`}
          >
            {count}
          </Badge>
        )}
      </h2>
      {viewAllHref && (
        <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
          <Link href={viewAllHref}>View all</Link>
        </Button>
      )}
    </div>
  );
};
