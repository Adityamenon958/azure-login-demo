import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { normalizeStatus } from '../constants/trackerStatus';

const TrackerSelectionContext = createContext(null);

const defaultFilters = {
  search: '',
  status: 'all',
};

function normalizeFilters(next) {
  const status = next?.status;
  if (!status || status === 'all') {
    return { ...defaultFilters, ...next, status: 'all' };
  }
  return { ...defaultFilters, ...next, status: normalizeStatus(status) };
}

export function TrackerSelectionProvider({ children }) {
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [filters, setFiltersState] = useState(defaultFilters);
  const [chartsExpanded, setChartsExpanded] = useState(false);

  // ✅ Supports object or updater fn; normalizes legacy online/offline keys
  const setFilters = useCallback((next) => {
    setFiltersState((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      return normalizeFilters(resolved);
    });
  }, []);

  const value = useMemo(
    () => ({
      selectedDeviceId,
      setSelectedDeviceId,
      filters,
      setFilters,
      resetFilters: () => setFiltersState(defaultFilters),
      chartsExpanded,
      setChartsExpanded,
    }),
    [selectedDeviceId, filters, setFilters, chartsExpanded]
  );

  return (
    <TrackerSelectionContext.Provider value={value}>
      {children}
    </TrackerSelectionContext.Provider>
  );
}

export function useTrackerSelection() {
  const ctx = useContext(TrackerSelectionContext);
  if (!ctx) {
    throw new Error('useTrackerSelection must be used within TrackerSelectionProvider');
  }
  return ctx;
}
