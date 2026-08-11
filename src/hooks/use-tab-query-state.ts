'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export function useTabQueryState<T extends string>(
  defaultTab: T,
  validTabs: readonly T[]
): [T, (tab: T) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const raw = searchParams.get('tab');
  const active = (validTabs as readonly string[]).includes(raw ?? '')
    ? (raw as T)
    : defaultTab;

  const setActive = useCallback(
    (tab: T) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', tab);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  return [active, setActive];
}
