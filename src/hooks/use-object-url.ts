import { useEffect, useMemo } from 'react';

/**
 * Creates an object URL for a File and revokes it on change/unmount, so a
 * blob: URL is never leaked while previewing an unsaved upload.
 */
export function useObjectUrl(file: File | undefined): string | undefined {
  const url = useMemo(
    () => (file ? URL.createObjectURL(file) : undefined),
    [file]
  );

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  return url;
}
