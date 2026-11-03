import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api';

export interface ApiData<T> {
  data: T | null;
  /** A message that is safe to show, or null. */
  error: string | null;
  loading: boolean;
  /** Fetch again, keeping the current data on screen until the reply arrives. */
  reload: () => void;
}

export function describeError(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
}

/**
 * Loads one thing from the API when the page opens and whenever `deps` change.
 * Pages use it so that loading and failure are shown instead of an empty screen.
 */
export function useApiData<T>(load: () => Promise<T>, deps: readonly unknown[]): ApiData<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load().then(
      (result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
        setLoading(false);
      },
      (failure: unknown) => {
        if (cancelled) return;
        setError(describeError(failure));
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
    // `load` is recreated on every render; callers list what it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadCount]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);
  return { data, error, loading, reload };
}
