import { useCallback, useEffect, useState } from 'react';
import {
  fetchAnalyticsSummary,
  fetchAnalyticsVehicles,
  fetchAnalyticsRankings,
} from '../services/trackerApi';
import { defaultAnalyticsRange } from '../utils/analyticsFormatters';

/**
 * Fleet Analytics data hook — on-demand fetch (no live poll by default).
 */
export function useFleetAnalytics(initialPreset = '7d') {
  const [range, setRange] = useState(() => defaultAnalyticsRange(initialPreset));
  const [summary, setSummary] = useState(null);
  const [vehicles, setVehicles] = useState(null);
  const [rankings, setRankings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: 'utilizationPct', order: 'desc' });
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = { from: range.from, to: range.to };
      const [s, v, r] = await Promise.all([
        fetchAnalyticsSummary(params),
        fetchAnalyticsVehicles({
          ...params,
          page,
          limit: 25,
          sort: sort.key,
          order: sort.order,
          search: search || undefined,
        }),
        fetchAnalyticsRankings({ ...params, metric: 'engineOnMs', limit: 10 }),
      ]);

      if (s?.success === false) throw new Error(s.error?.message || 'Summary failed');
      if (v?.success === false) throw new Error(v.error?.message || 'Vehicles failed');
      if (r?.success === false) throw new Error(r.error?.message || 'Rankings failed');

      setSummary(s?.data ?? s);
      setVehicles(v?.data ?? v);
      setRankings(r?.data ?? r);
    } catch (err) {
      setError(err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, page, sort.key, sort.order, search]);

  useEffect(() => {
    load();
  }, [load]);

  const applyPreset = useCallback((preset) => {
    setRange(defaultAnalyticsRange(preset));
    setPage(1);
  }, []);

  return {
    range,
    setRange,
    applyPreset,
    summary,
    vehicles,
    rankings,
    loading,
    error,
    page,
    setPage,
    sort,
    setSort,
    search,
    setSearch,
    refresh: load,
  };
}

export default useFleetAnalytics;
