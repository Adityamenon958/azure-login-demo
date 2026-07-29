import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button, Spinner } from 'react-bootstrap';
import { LayoutGrid, Scan } from 'lucide-react';
import { STATUS_COLORS, STATUS_LABELS, normalizeStatus } from '../../constants/trackerStatus';
import { averageCenter, isValidCoordinates } from '../../utils/mapHelpers';
import { filterLocations } from '../../utils/filterDevices';
import TrackerStatusBadge from '../status/TrackerStatusBadge';
import styles from './TrackerLiveMap.module.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const LEGEND_KEYS = ['moving', 'idle', 'parked', 'needsAttention'];

/** ✅ Cache icons by status — avoid recreating DivIcon on every poll */
const iconCache = new Map();

function getStatusIcon(status) {
  const key = normalizeStatus(status) || 'needsAttention';
  if (iconCache.has(key)) return iconCache.get(key);
  const color = STATUS_COLORS[key] || STATUS_COLORS.needsAttention;
  const icon = L.divIcon({
    className: styles.marker,
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
  iconCache.set(key, icon);
  return icon;
}

function FitOnce({ center, shouldFit }) {
  const map = useMap();
  useEffect(() => {
    if (shouldFit && center) {
      map.setView(center, map.getZoom() || 5);
    }
  }, [shouldFit, center, map]);
  return null;
}

function MapReadyBridge({ onMapReady }) {
  const map = useMap();
  useEffect(() => {
    onMapReady?.(map);
  }, [map, onMapReady]);
  return null;
}

function MapClickDeselect({ onDeselect }) {
  const map = useMap();
  useEffect(() => {
    if (!onDeselect) return undefined;
    const handler = (e) => {
      // Only empty-map clicks (not markers)
      if (e.originalEvent?.target?.closest?.('.leaflet-marker-icon')) return;
      onDeselect();
    };
    map.on('click', handler);
    return () => map.off('click', handler);
  }, [map, onDeselect]);
  return null;
}

const TrackerMarker = memo(
  function TrackerMarker({ loc, selected, onSelect }) {
    if (!isValidCoordinates(loc.latitude, loc.longitude)) return null;
    return (
      <Marker
        position={[loc.latitude, loc.longitude]}
        icon={getStatusIcon(loc.status)}
        eventHandlers={{ click: () => onSelect?.(loc.deviceId) }}
        zIndexOffset={selected ? 1000 : 0}
      >
        <Popup>
          <div style={{ minWidth: 120, fontSize: '0.75rem' }}>
            <div className="fw-bold mb-1">{loc.displayName || loc.deviceId}</div>
            <TrackerStatusBadge status={loc.status} />
          </div>
        </Popup>
      </Marker>
    );
  },
  (prev, next) =>
    prev.selected === next.selected &&
    prev.onSelect === next.onSelect &&
    prev.loc.deviceId === next.loc.deviceId &&
    prev.loc.latitude === next.loc.latitude &&
    prev.loc.longitude === next.loc.longitude &&
    prev.loc.status === next.loc.status
);

/**
 * @param {object} props
 * @param {boolean} [props.fillHeight] — Fleet Map: stretch map to parent
 * @param {function} [props.onMapReady] — imperative Leaflet map instance
 * @param {string} [props.searchFilter] — filters markers with statusFilter
 * @param {boolean} [props.showFitAll] — show Fit All toolbar button
 * @param {Date|null} [props.lastUpdated]
 * @param {function} [props.onDeselect] — empty map click
 * @param {'dashboard'|'fleetMap'} [props.viewMode]
 * @param {function} [props.onToggleViewMode] — show Fleet Map / Dashboard toggle in header
 */
export default function TrackerLiveMap({
  locations = [],
  loading,
  selectedDeviceId,
  onSelect,
  statusFilter = 'all',
  searchFilter = '',
  onMapReady,
  fillHeight = false,
  showFitAll = false,
  lastUpdated = null,
  onDeselect,
  title = 'Live Map',
  viewMode = 'dashboard',
  onToggleViewMode,
}) {
  const [fitted, setFitted] = useState(false);
  const mapRef = useRef(null);

  const visibleLocations = useMemo(
    () => filterLocations(locations, { search: searchFilter, status: statusFilter }),
    [locations, searchFilter, statusFilter]
  );

  const center = useMemo(() => averageCenter(visibleLocations), [visibleLocations]);

  useEffect(() => {
    if (!fitted && visibleLocations.length > 0) setFitted(true);
  }, [visibleLocations, fitted]);

  const handleMapReady = useCallback(
    (map) => {
      mapRef.current = map;
      onMapReady?.(map);
    },
    [onMapReady]
  );

  const handleFitAll = useCallback(() => {
    const map = mapRef.current;
    if (!map || visibleLocations.length === 0) return;
    const latLngs = visibleLocations
      .filter((l) => isValidCoordinates(l.latitude, l.longitude))
      .map((l) => [l.latitude, l.longitude]);
    if (latLngs.length === 0) return;
    map.fitBounds(latLngs, { padding: [28, 28], maxZoom: 14 });
  }, [visibleLocations]);

  return (
    <div
      className={`${styles.wrap} ${fillHeight ? styles.fillHeight : ''} bg-white shadow-sm rounded overflow-hidden`}
    >
      <div className="d-flex justify-content-between align-items-center px-2 py-1 border-bottom gap-2">
        <h6 className="mb-0" style={{ fontSize: '0.8rem' }}>
          {title}
        </h6>
        <div className="d-flex align-items-center gap-2">
          {lastUpdated && (
            <span className="text-muted" style={{ fontSize: '0.65rem' }}>
              Updated{' '}
              {lastUpdated.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}
            </span>
          )}
          {showFitAll && (
            <Button
              size="sm"
              variant="outline-secondary"
              className="py-0 px-2"
              style={{ fontSize: '0.7rem' }}
              onClick={handleFitAll}
              disabled={visibleLocations.length === 0}
            >
              Fit All
            </Button>
          )}
          {/* ✅ View mode toggle sits on the Live Map / Fleet Map header row (desktop+) */}
          {onToggleViewMode && (
            <Button
              size="sm"
              variant="link"
              className={`d-none d-md-inline-flex align-items-center justify-content-center ${styles.modeToggle}`}
              onClick={onToggleViewMode}
              title={viewMode === 'fleetMap' ? 'Switch to Dashboard' : 'Switch to Fleet Map'}
              aria-label={viewMode === 'fleetMap' ? 'Switch to Dashboard' : 'Switch to Fleet Map'}
            >
              {viewMode === 'fleetMap' ? <LayoutGrid size={15} /> : <Scan size={15} />}
            </Button>
          )}
          {loading && <Spinner animation="border" size="sm" />}
        </div>
      </div>
      <div className={fillHeight ? styles.mapBoxFill : styles.mapBox}>
        <MapContainer
          center={center}
          zoom={5}
          style={{ height: '100%', width: '100%' }}
          zoomControl
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapReadyBridge onMapReady={handleMapReady} />
          <MapClickDeselect onDeselect={onDeselect} />
          <FitOnce center={center} shouldFit={!fitted && visibleLocations.length > 0} />
          {visibleLocations.map((loc) => (
            <TrackerMarker
              key={loc.deviceId}
              loc={loc}
              selected={selectedDeviceId === loc.deviceId}
              onSelect={onSelect}
            />
          ))}
        </MapContainer>
      </div>
      <div className="d-flex flex-wrap gap-2 px-2 py-1 border-top" style={{ fontSize: '0.65rem' }}>
        {LEGEND_KEYS.map((key) => (
          <span key={key} className="d-inline-flex align-items-center gap-1 text-muted">
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: STATUS_COLORS[key],
                display: 'inline-block',
              }}
            />
            {STATUS_LABELS[key]}
          </span>
        ))}
      </div>
    </div>
  );
}
