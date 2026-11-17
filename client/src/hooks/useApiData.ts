import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api';

export interface ApiData<T> {
  data: T | null;
  /** A message that is safe to show, or null. */
  error: string | null;
  /**
   * The thing in the URL does not exist. A 400 counts too: for these GETs it
   * only means the id in the address is malformed, which to a student is the
   * same dead end. Pages show a way out instead of "Try again".
   */
  notFound: boolean;
  loading: boolean;
  /** Fetch again, keeping the current data on screen until the reply arrives. */
  reload: () => void;
}

const GENERIC_FAILURE = 'Something went wrong on our side. Please try again.';

/**
 * A message that is safe to show a student. The API's 4xx messages are about
 * the student's own request ("This group is full.") and are written for them.
 * Anything else (the server or database being down, no network) carries
 * details meant for developers, such as which setting to check in
 * server/.env, so the student sees `fallback` instead.
 */
export function describeError(error: unknown, fallback: string = GENERIC_FAILURE): string {
  const isAboutTheRequest = error instanceof ApiError && error.status >= 400 && error.status < 500;
  return isAboutTheRequest ? error.message : fallback;
}

/**
 * Loads one thing from the API when the page opens and whenever `deps` change.
 * Pages use it so that loading and failure are shown instead of an empty screen.
 */
export function useApiData<T>(
  load: () => Promise<T>,
  deps: readonly unknown[],
  /** What to say when the server, not the request, is the problem. */
  failureMessage?: string,
): ApiData<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
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
        setNotFound(false);
        setLoading(false);
      },
      (failure: unknown) => {
        if (cancelled) return;
        setError(describeError(failure, failureMessage));
        setNotFound(failure instanceof ApiError && (failure.status === 404 || failure.status === 400));
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
  return { data, error, notFound, loading, reload };
}
