import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchAnalyticsSummary,
  fetchAnalyticsVehicles,
  fetchLiveLocations,
} from '../services/trackerApi';
import { defaultAnalyticsRange, shiftAnalyticsRange, customAnalyticsRange } from '../utils/analyticsFormatters';
import {
  liveLocationsToMap,
  mergeAnalyticsWithLive,
} from '../utils/mergeAnalyticsWithLive';
import { LIVE_LOCATIONS_POLL_MS } from '../constants/pollIntervals';

const GRID_PAGE_SIZE = 100;
const TABLE_PAGE_SIZE = 25;

/**
 * Fleet Analytics — hybrid analytics + live locations.
 * Analytics refetch on range/search/sort/refresh.
 * Live poll updates status/speed/lastSeen without refetching analytics.
 */
export function useFleetAnalytics(initialPreset = '7d') {
  const [range, setRange] = useState(() => defaultAnalyticsRange(initialPreset));
  const [summary, setSummary] = useState(null);
  const [vehicleItems, setVehicleItems] = useState([]);
  const [vehicleTotal, setVehicleTotal] = useState(0);
  const [liveById, setLiveById] = useState({});
  const [generatedAt, setGeneratedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [tablePage, setTablePage] = useState(1);
  const [sort, setSort] = useState({ key: 'utilizationPct', order: 'desc' });
  const [search, setSearch] = useState('');

  const gridPageRef = useRef(1);

  const loadAnalytics = useCallback(
    async ({ append = false } = {}) => {
      const nextPage = append ? gridPageRef.current + 1 : 1;
      try {
        if (append) setLoadingMore(true);
        else {
          setLoading(true);
          setError(null);
        }

        const params = { from: range.from, to: range.to };
        const [s, v] = await Promise.all([
          append
            ? Promise.resolve(null)
            : fetchAnalyticsSummary(params),
          fetchAnalyticsVehicles({
            ...params,
            page: nextPage,
            limit: GRID_PAGE_SIZE,
            sort: sort.key,
            order: sort.order,
            search: search || undefined,
          }),
        ]);

        if (!append) {
          if (s?.success === false) throw new Error(s.error?.message || 'Summary failed');
          setSummary(s?.data ?? s);
          const at = s?.generatedAt || null;
          setGeneratedAt(at ? new Date(at) : null);
        }

        if (v?.success === false) throw new Error(v.error?.message || 'Vehicles failed');
        const vData = v?.data ?? v;
        const items = vData?.items || [];

        gridPageRef.current = nextPage;
        setVehicleTotal(vData?.total ?? items.length);
        setVehicleItems((prev) => (append ? [...prev, ...items] : items));
        if (!append) setTablePage(1);
      } catch (err) {
        setError(err.message || 'Failed to load analytics');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [range.from, range.to, sort.key, sort.order, search]
  );

  // Analytics load on deps change
  useEffect(() => {
    gridPageRef.current = 1;
    loadAnalytics({ append: false });
  }, [loadAnalytics]);

  // Live locations poll (independent of analytics)
  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const live = await fetchLiveLocations();
        if (cancelled) return;
        setLiveById(liveLocationsToMap(live));
      } catch {
        // Keep last known live map on transient failures
      }
    };

    poll();
    const id = setInterval(poll, LIVE_LOCATIONS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const vehiclesWithLive = useMemo(
    () => mergeAnalyticsWithLive(vehicleItems, liveById),
    [vehicleItems, liveById]
  );

  const hasMore = vehicleItems.length < vehicleTotal;

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    loadAnalytics({ append: true });
  }, [loadAnalytics, loadingMore, hasMore]);

  const applyPreset = useCallback((preset) => {
    // Custom is handled by the date-range picker (applyCustomRange) — do not reset dates here
    if (preset === 'custom') {
      return;
    }
    setRange(defaultAnalyticsRange(preset));
    setTablePage(1);
  }, []);

  // ✅ Custom from/to from the date picker — same range state
  const applyCustomRange = useCallback((fromYmd, toYmd) => {
    const next = customAnalyticsRange(fromYmd, toYmd);
    if (!next) return;
    setRange(next);
    setTablePage(1);
  }, []);

  // ✅ Shift from/to by ±1 day — marks Custom so presets stay honest
  const shiftRangeByDays = useCallback((dayDelta) => {
    setRange((prev) => ({
      ...shiftAnalyticsRange(prev, dayDelta),
      preset: 'custom',
    }));
    setTablePage(1);
  }, []);

  // Table: client slice over accumulated grid items
  const tableData = useMemo(() => {
    const start = (tablePage - 1) * TABLE_PAGE_SIZE;
    return {
      items: vehiclesWithLive.slice(start, start + TABLE_PAGE_SIZE),
      total: vehicleTotal,
      page: tablePage,
      limit: TABLE_PAGE_SIZE,
    };
  }, [vehiclesWithLive, vehicleTotal, tablePage]);

  const setPage = useCallback(
    (p) => {
      const next = typeof p === 'function' ? p(tablePage) : p;
      const needed = next * TABLE_PAGE_SIZE;
      if (needed > vehicleItems.length && vehicleItems.length < vehicleTotal) {
        loadMore();
      }
      setTablePage(next);
    },
    [tablePage, vehicleItems.length, vehicleTotal, loadMore]
  );

  const refresh = useCallback(async () => {
    gridPageRef.current = 1;
    await loadAnalytics({ append: false });
    try {
      const live = await fetchLiveLocations();
      setLiveById(liveLocationsToMap(live));
    } catch {
      /* ignore */
    }
  }, [loadAnalytics]);

  return {
    range,
    setRange,
    applyPreset,
    applyCustomRange,
    shiftRangeByDays,
    summary,
    vehicles: tableData,
    vehiclesWithLive,
    liveById,
    vehicleTotal,
    hasMore,
    loadMore,
    loadingMore,
    generatedAt,
    loading,
    error,
    page: tablePage,
    setPage,
    sort,
    setSort,
    search,
    setSearch,
    refresh,
  };
}

export default useFleetAnalytics;
