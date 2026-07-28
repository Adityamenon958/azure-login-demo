import { useCallback, useEffect, useRef, useState } from 'react';
import * as trackerApi from '../services/trackerApi';
const { fetchOverview, fetchLiveLocations, fetchDevice, fetchHistory, fetchStatistics, fetchActivity } = trackerApi;

function usePolledResource(fetcher, intervalMs, { enabled = true, deps = [] } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const mounted = useRef(true);

  const load = useCallback(
    async (silent = false) => {
      if (!enabled) return;
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

  useEffect(() => {
    mounted.current = true;
    if (!enabled) {
      setLoading(false);
      return undefined;
    }
    load(false);
    if (!intervalMs) return () => { mounted.current = false; };
    const id = setInterval(() => load(true), intervalMs);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [enabled, intervalMs, load]);

  return { data, error, loading, lastUpdated, refresh: () => load(true) };
}

export function useTrackerOverview(intervalMs) {
  const fetcher = useCallback(() => fetchOverview(), []);
  return usePolledResource(fetcher, intervalMs);
}

export function useTrackerLiveLocations(intervalMs) {
  const fetcher = useCallback(() => fetchLiveLocations(), []);
  return usePolledResource(fetcher, intervalMs);
}

export function useTrackerDevice(deviceId, intervalMs) {
  const fetcher = useCallback(() => fetchDevice(deviceId), [deviceId]);
  return usePolledResource(fetcher, intervalMs, {
    enabled: Boolean(deviceId),
    deps: [deviceId],
  });
}

export function useTrackerHistory(deviceId, from, to) {
  const fetcher = useCallback(
    () => fetchHistory(deviceId, { from, to, limit: 2000 }),
    [deviceId, from, to]
  );
  return usePolledResource(fetcher, null, {
    enabled: Boolean(deviceId && from && to),
    deps: [deviceId, from, to],
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

export function useTrackerActivity(deviceId, intervalMs) {
  const fetcher = useCallback(
    () => fetchActivity(deviceId ? { deviceId, limit: 30 } : { limit: 30 }),
    [deviceId]
  );
  return usePolledResource(fetcher, intervalMs, {
    enabled: true,
    deps: [deviceId],
  });
}
