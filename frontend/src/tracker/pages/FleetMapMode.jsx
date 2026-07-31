import React, { useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTrackerSelection } from '../context/TrackerSelectionContext';
import { filterDevices } from '../utils/filterDevices';
import { focusMapOnPoint } from '../utils/mapHelpers';
import { useTimestampTick } from '../hooks/useTimestampTick';
import FleetSummary from '../components/fleetMap/FleetSummary';
import FleetMapFilterBar from '../components/fleetMap/FleetMapFilterBar';
import VehicleListPanel from '../components/fleetMap/VehicleListPanel';
import SelectedVehiclePanel from '../components/fleetMap/SelectedVehiclePanel';
import TrackerLiveMap from '../components/map/TrackerLiveMap';
import styles from './FleetMapMode.module.css';

/**
 * Fleet Map layout — 38% list / 62% map.
 * Receives polled data as props (no duplicate hooks).
 */
export default function FleetMapMode({
  devices = [],
  locations = [],
  kpis,
  overviewLoading,
  liveLoading,
  liveLastUpdated,
  detail,
  detailLoading,
}) {
  const navigate = useNavigate();
  const {
    selectedDeviceId,
    setSelectedDeviceId,
    filters,
    setFilters,
    setViewMode,
  } = useTrackerSelection();

  const mapRef = useRef(null);
  const now = useTimestampTick();

  // ✅ Merge live fields onto overview devices for fresher list status/speed
  const mergedDevices = useMemo(() => {
    const byId = new Map((locations || []).map((l) => [l.deviceId, l]));
    return (devices || []).map((d) => {
      const live = byId.get(d.deviceId);
      if (!live) return d;
      return {
        ...d,
        status: live.status ?? d.status,
        speed: live.speed ?? d.speed,
        lastSeenAt: live.lastSeenAt ?? d.lastSeenAt,
        latitude: live.latitude,
        longitude: live.longitude,
      };
    });
  }, [devices, locations]);

  const filteredDevices = useMemo(
    () => filterDevices(mergedDevices, { search: filters.search, status: filters.status }),
    [mergedDevices, filters.search, filters.status]
  );

  const selectedFallback = useMemo(
    () => mergedDevices.find((d) => d.deviceId === selectedDeviceId) || null,
    [mergedDevices, selectedDeviceId]
  );

  const handleStatusClick = useCallback(
    (key) => {
      setFilters((prev) => ({
        ...prev,
        status: key === 'all' ? 'all' : prev.status === key ? 'all' : key,
      }));
    },
    [setFilters]
  );

  const handleSearchChange = useCallback(
    (search) => {
      setFilters((prev) => ({ ...prev, search }));
    },
    [setFilters]
  );

  const handleSelect = useCallback(
    (id) => {
      setSelectedDeviceId((prev) => {
        const next = prev === id ? null : id;
        if (next) {
          const row = mergedDevices.find((d) => d.deviceId === next);
          // ✅ Zoom in to the vehicle — pan alone left the map stuck at continental zoom
          if (row) focusMapOnPoint(mapRef.current, row.latitude, row.longitude);
        }
        return next;
      });
    },
    [mergedDevices, setSelectedDeviceId]
  );

  const handleMapSelect = useCallback(
    (id) => {
      setSelectedDeviceId(id);
      const row =
        mergedDevices.find((d) => d.deviceId === id) ||
        locations.find((l) => l.deviceId === id);
      if (row) focusMapOnPoint(mapRef.current, row.latitude, row.longitude);
    },
    [mergedDevices, locations, setSelectedDeviceId]
  );

  const handleCenterMap = useCallback(() => {
    const lat =
      detail?.state?.latitude ?? detail?.liveState?.latitude ?? selectedFallback?.latitude;
    const lon =
      detail?.state?.longitude ?? detail?.liveState?.longitude ?? selectedFallback?.longitude;
    focusMapOnPoint(mapRef.current, lat, lon);
  }, [detail, selectedFallback]);

  const handleOpenDetail = useCallback(() => {
    if (!selectedDeviceId) return;
    navigate(`/dashboard/tracker/${encodeURIComponent(selectedDeviceId)}`);
  }, [navigate, selectedDeviceId]);

  const handleMapReady = useCallback((map) => {
    mapRef.current = map;
  }, []);

  return (
    <div className={styles.layout}>
      <aside className={styles.left}>
        <FleetSummary
          kpis={kpis}
          selectedStatus={filters.status}
          onStatusClick={handleStatusClick}
        />
        <FleetMapFilterBar
          search={filters.search}
          status={filters.status}
          kpis={kpis}
          onSearchChange={handleSearchChange}
          onStatusClick={handleStatusClick}
        />
        <VehicleListPanel
          items={filteredDevices}
          selectedDeviceId={selectedDeviceId}
          onSelect={handleSelect}
          loading={overviewLoading}
          now={now}
        />
        <SelectedVehiclePanel
          deviceId={selectedDeviceId}
          detail={detail}
          fallback={selectedFallback}
          loading={detailLoading}
          onOpenDetail={handleOpenDetail}
          onCenterMap={handleCenterMap}
          onClear={() => setSelectedDeviceId(null)}
        />
      </aside>
      <section className={styles.right}>
        <TrackerLiveMap
          locations={locations}
          loading={liveLoading}
          selectedDeviceId={selectedDeviceId}
          onSelect={handleMapSelect}
          statusFilter={filters.status}
          searchFilter={filters.search}
          onMapReady={handleMapReady}
          fillHeight
          showFitAll
          lastUpdated={liveLastUpdated}
          onDeselect={() => setSelectedDeviceId(null)}
          title="Fleet Map"
          viewMode="fleetMap"
          onToggleViewMode={() => setViewMode('dashboard')}
        />
      </section>
    </div>
  );
}
