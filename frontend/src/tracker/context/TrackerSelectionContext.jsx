import React, { createContext, useContext, useMemo, useState } from 'react';

const TrackerSelectionContext = createContext(null);

const defaultFilters = {
  search: '',
  status: 'all',
};

export function TrackerSelectionProvider({ children }) {
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [filters, setFilters] = useState(defaultFilters);
  const [chartsExpanded, setChartsExpanded] = useState(false);

  const value = useMemo(
    () => ({
      selectedDeviceId,
      setSelectedDeviceId,
      filters,
      setFilters,
      resetFilters: () => setFilters(defaultFilters),
      chartsExpanded,
      setChartsExpanded,
    }),
    [selectedDeviceId, filters, chartsExpanded]
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
