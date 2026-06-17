import { Button } from '@/components/ui/button';

import {
  RequestCard,
  type RequestRow,
} from '@/app/requester/history/_components/request-card';

type RequestListProps = {
  requests: RequestRow[];
  nextCursor: string | null;
  loadingMore: boolean;
  onLoadMore: () => void;
};

export const RequestList = ({
  requests,
  nextCursor,
  loadingMore,
  onLoadMore,
}: RequestListProps) => (
  <>
    <ul className="flex flex-col gap-3" aria-label="Request history">
      {requests.map((request) => (
        <RequestCard key={request.id} request={request} />
      ))}
    </ul>

    {nextCursor && (
      <div className="flex justify-center">
        <Button
          variant="outline"
          size="sm"
          onClick={onLoadMore}
          disabled={loadingMore}
          aria-busy={loadingMore}
        >
          {loadingMore ? 'Loading…' : 'Load more'}
        </Button>
      </div>
    )}
  </>
);
