import { QueryClient } from '@tanstack/react-query';
import { cache } from 'react';

// One QueryClient per server request, never a shared singleton — sharing one
// across requests would leak one user's prefetched cache into another's
// response. `cache()` scopes this to a single render/request in the App
// Router. Mirrors src/providers/query-provider.tsx's defaultOptions so a
// server-prefetched query and a client-created one behave identically.
export const getQueryClient = cache(
  () =>
    new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60 * 1000,
          retry: 1,
        },
      },
    })
);
