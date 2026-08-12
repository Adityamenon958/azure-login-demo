import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import axios from 'axios';

const STORAGE_KEY = 'trackerDataSourcePrefs';

const TrackerDataSourceContext = createContext(null);

function readStoredPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { showRealData: true, showDemoData: true };
    const parsed = JSON.parse(raw);
    return {
      showRealData: parsed.showRealData !== false,
      showDemoData: parsed.showDemoData !== false,
    };
  } catch {
    return { showRealData: true, showDemoData: true };
  }
}

export function TrackerDataSourceProvider({ children }) {
  const stored = useMemo(() => readStoredPrefs(), []);
  const [showRealData, setShowRealData] = useState(stored.showRealData);
  const [showDemoData, setShowDemoData] = useState(stored.showDemoData);
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadRole = async () => {
      try {
        const res = await axios.get('/api/auth/userinfo', { withCredentials: true });
        if (!cancelled) {
          setCanEdit(res.data?.role === 'superadmin');
        }
      } catch {
        if (!cancelled) setCanEdit(false);
      }
    };

    loadRole();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!canEdit) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ showRealData, showDemoData })
    );
  }, [canEdit, showRealData, showDemoData]);

  const setShowRealDataSafe = useCallback(
    (value) => {
      if (!canEdit) return;
      setShowRealData(Boolean(value));
    },
    [canEdit]
  );

  const setShowDemoDataSafe = useCallback(
    (value) => {
      if (!canEdit) return;
      setShowDemoData(Boolean(value));
    },
    [canEdit]
  );

  const apiParams = useMemo(() => {
    if (!canEdit) return {};
    return {
      includeReal: showRealData,
      includeDemo: showDemoData,
    };
  }, [canEdit, showRealData, showDemoData]);

  const value = useMemo(
    () => ({
      showRealData: canEdit ? showRealData : true,
      showDemoData: canEdit ? showDemoData : true,
      setShowRealData: setShowRealDataSafe,
      setShowDemoData: setShowDemoDataSafe,
      canEdit,
      apiParams,
      isFiltered: canEdit && (!showRealData || !showDemoData),
    }),
    [
      canEdit,
      showRealData,
      showDemoData,
      setShowRealDataSafe,
      setShowDemoDataSafe,
      apiParams,
    ]
  );

  return (
    <TrackerDataSourceContext.Provider value={value}>
      {children}
    </TrackerDataSourceContext.Provider>
  );
}

export function useTrackerDataSource() {
  const ctx = useContext(TrackerDataSourceContext);
  if (!ctx) {
    throw new Error('useTrackerDataSource must be used within TrackerDataSourceProvider');
  }
  return ctx;
}
