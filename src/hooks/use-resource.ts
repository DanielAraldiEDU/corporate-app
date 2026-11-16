import { useCallback, useEffect, useRef, useState } from 'react';

import { errorMessage } from '@/services/api/errors';

export type ResourceState<T> = {
  data: T | undefined;
  error: string | null;
  /** First load with no data yet. */
  loading: boolean;
  /** Reload while existing data stays on screen. */
  refreshing: boolean;
  reload: () => Promise<void>;
};

/**
 * Minimal data loader with the four screen states (loading, error, empty via data, content).
 * Keeps stale data visible during refresh to avoid spinner blinks.
 */
export function useResource<T>(fetcher: () => Promise<T>, { enabled = true } = {}): ResourceState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });
  const hasData = useRef(false);
  const mounted = useRef(true);

  const reload = useCallback(async () => {
    if (hasData.current) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await fetcherRef.current();
      if (!mounted.current) return;
      hasData.current = true;
      setData(result);
      setError(null);
    } catch (e) {
      if (mounted.current) setError(errorMessage(e));
    } finally {
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (enabled) void reload();
    return () => {
      mounted.current = false;
    };
  }, [enabled, reload]);

  return { data, error, loading, refreshing, reload };
}
