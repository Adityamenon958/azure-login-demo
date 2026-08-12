import { useCallback, useMemo, useState } from 'react';
import {
  getAttendanceForDate,
  getDefaultAttendanceDate,
  computeKpis,
} from '../mock/attendanceMockData';

/**
 * ✅ Owns attendance dashboard state.
 * Components receive props only — swap this hook body for API calls later.
 */
export function useAttendanceDashboard() {
  const [selectedDate, setSelectedDate] = useState(getDefaultAttendanceDate);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [siteFilter, setSiteFilter] = useState('all');
  const [refreshNonce, setRefreshNonce] = useState(0);

  const raw = useMemo(() => {
    return getAttendanceForDate(selectedDate, { bustCache: refreshNonce > 0 });
  }, [selectedDate, refreshNonce]);

  const employees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (raw.employees || []).filter((e) => {
      if (statusFilter !== 'all' && e.status !== statusFilter) return false;
      if (siteFilter !== 'all' && e.siteType !== siteFilter) return false;
      if (!q) return true;
      return (
        String(e.name || '').toLowerCase().includes(q) ||
        String(e.id || '').toLowerCase().includes(q) ||
        String(e.department || '').toLowerCase().includes(q) ||
        String(e.role || '').toLowerCase().includes(q)
      );
    });
  }, [raw.employees, search, statusFilter, siteFilter]);

  // KPIs reflect the filtered set so the strip stays honest while searching
  const kpis = useMemo(() => computeKpis(employees), [employees]);

  const refresh = useCallback(() => {
    setRefreshNonce((n) => n + 1);
  }, []);

  return {
    selectedDate,
    setSelectedDate,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    siteFilter,
    setSiteFilter,
    kpis,
    trend: raw.trend || [],
    employees,
    totalUnfiltered: (raw.employees || []).length,
    generatedAt: raw.generatedAt ? new Date(raw.generatedAt) : new Date(),
    refresh,
  };
}

export default useAttendanceDashboard;
