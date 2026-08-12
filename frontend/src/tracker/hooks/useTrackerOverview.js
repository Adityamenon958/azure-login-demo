import { useCallback, useEffect, useRef, useState } from 'react';
import * as trackerApi from '../services/trackerApi';

const {
  fetchOverview,
  fetchLiveLocations,
  fetchDevice,
  fetchHistory,
  fetchStatistics,
  fetchActivity,
  fetchJourney,
  withDataSourceParams,
} = trackerApi;

function usePolledResource(fetcher, intervalMs, { enabled = true, deps = [] } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const mounted = useRef(true);
  const loadRef = useRef(null);

  const load = useCallback(
    async (silent = false) => {
      if (!enabled) return;
      // ✅ Pause network work when tab is hidden (interval still checked in tick)
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden' && silent) {
        return;
      }
      try {
        if (!silent) setLoading(true);
        const result = await fetcher();
        if (!mounted.current) return;
        if (result?.success === false) {
          setError(result.error?.message || 'Request failed');
          return;
        }
        setData(result?.data ?? result);
        setLastUpdated(result?.generatedAt ? new Date(result.generatedAt) : new Date());
        setError(null);
      } catch (err) {
        if (!mounted.current) return;
        setError(err.response?.data?.error?.message || err.message || 'Request failed');
      } finally {
        if (mounted.current && !silent) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, fetcher, ...deps]
  );

  loadRef.current = load;

  useEffect(() => {
    mounted.current = true;
    if (!enabled) {
      setLoading(false);
      return undefined;
    }
    load(false);
    if (!intervalMs) {
      return () => {
        mounted.current = false;
      };
    }

    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      loadRef.current?.(true);
    }, intervalMs);

    // ✅ Immediate silent refresh when tab becomes visible again
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadRef.current?.(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      mounted.current = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, intervalMs, load]);

  return { data, error, loading, lastUpdated, refresh: () => load(true) };
}

export function useTrackerOverview(intervalMs, dataSourceParams = {}) {
  const fetcher = useCallback(
    () => fetchOverview(withDataSourceParams({}, dataSourceParams)),
    [dataSourceParams.includeReal, dataSourceParams.includeDemo]
  );
  return usePolledResource(fetcher, intervalMs, {
    deps: [dataSourceParams.includeReal, dataSourceParams.includeDemo],
  });
}

export function useTrackerLiveLocations(intervalMs, dataSourceParams = {}) {
  const fetcher = useCallback(
    () => fetchLiveLocations(withDataSourceParams({}, dataSourceParams)),
    [dataSourceParams.includeReal, dataSourceParams.includeDemo]
  );
  return usePolledResource(fetcher, intervalMs, {
    deps: [dataSourceParams.includeReal, dataSourceParams.includeDemo],
  });
}

export function useTrackerDevice(deviceId, intervalMs, dataSourceParams = {}) {
  const fetcher = useCallback(
    () => fetchDevice(deviceId, withDataSourceParams({}, dataSourceParams)),
    [deviceId, dataSourceParams.includeReal, dataSourceParams.includeDemo]
  );
  return usePolledResource(fetcher, intervalMs, {
    enabled: Boolean(deviceId),
    deps: [deviceId, dataSourceParams.includeReal, dataSourceParams.includeDemo],
  });
}

export function useTrackerHistory(deviceId, from, to, limit = 2000) {
  const fetcher = useCallback(
    () => fetchHistory(deviceId, { from, to, limit }),
    [deviceId, from, to, limit]
  );
  return usePolledResource(fetcher, null, {
    enabled: Boolean(deviceId && from && to),
    deps: [deviceId, from, to, limit],
  });
}

export function useTrackerStats(deviceId, from, to, interval = '5m', enabled = false) {
  const fetcher = useCallback(
    () => fetchStatistics(deviceId, { from, to, interval }),
    [deviceId, from, to, interval]
  );
  return usePolledResource(fetcher, null, {
    enabled: Boolean(enabled && deviceId && from && to),
    deps: [deviceId, from, to, interval, enabled],
  });
}

export function useTrackerActivity(deviceId, intervalMs, enabled = true, dataSourceParams = {}) {
  const fetcher = useCallback(
    () =>
      fetchActivity(
        withDataSourceParams(deviceId ? { deviceId, limit: 30 } : { limit: 30 }, dataSourceParams)
      ),
    [deviceId, dataSourceParams.includeReal, dataSourceParams.includeDemo]
  );
  return usePolledResource(fetcher, intervalMs, {
    enabled: Boolean(enabled),
    deps: [deviceId, enabled, dataSourceParams.includeReal, dataSourceParams.includeDemo],
  });
}

export function useTrackerJourney(deviceId, from, to) {
  const fetcher = useCallback(
    () => fetchJourney(deviceId, { from, to }),
    [deviceId, from, to]
  );
  return usePolledResource(fetcher, null, {
    enabled: Boolean(deviceId && from && to),
    deps: [deviceId, from, to],
  });
}
