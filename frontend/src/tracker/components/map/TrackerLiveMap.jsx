import React, { memo, useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Spinner } from 'react-bootstrap';
import { STATUS_COLORS, STATUS_LABELS, normalizeStatus } from '../../constants/trackerStatus';
import { averageCenter, isValidCoordinates } from '../../utils/mapHelpers';
import { formatRelativeTime, formatSpeed } from '../../utils/formatters';
import TrackerStatusBadge from '../status/TrackerStatusBadge';
import styles from './TrackerLiveMap.module.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const LEGEND_KEYS = ['moving', 'idle', 'parked', 'needsAttention'];

function createStatusIcon(status) {
  const key = normalizeStatus(status);
  const color = STATUS_COLORS[key] || STATUS_COLORS.needsAttention;
  return L.divIcon({
    className: styles.marker,
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
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

const TrackerMarker = memo(function TrackerMarker({ loc, selected, onSelect }) {
  if (!isValidCoordinates(loc.latitude, loc.longitude)) return null;
  return (
    <Marker
      position={[loc.latitude, loc.longitude]}
      icon={createStatusIcon(loc.status)}
      eventHandlers={{ click: () => onSelect?.(loc.deviceId) }}
      zIndexOffset={selected ? 1000 : 0}
    >
      <Popup>
        <div style={{ minWidth: 140, fontSize: '0.75rem' }}>
          <div className="fw-bold mb-1">{loc.displayName || loc.deviceId}</div>
          {loc.deviceModel && (
            <div className="text-muted mb-1">{loc.deviceModel}</div>
          )}
          <TrackerStatusBadge status={loc.status} />
          <div className="mt-1">{formatSpeed(loc.speed)}</div>
          <div className="text-muted">{formatRelativeTime(loc.lastSeenAt)}</div>
        </div>
      </Popup>
    </Marker>
  );
});

export default function TrackerLiveMap({
  locations = [],
  loading,
  selectedDeviceId,
  onSelect,
  statusFilter = 'all',
}) {
  const [fitted, setFitted] = useState(false);

  // ✅ Filter markers by KPI / filter status (same taxonomy as table)
  const visibleLocations = useMemo(() => {
    if (!statusFilter || statusFilter === 'all') return locations;
    const wanted = normalizeStatus(statusFilter);
    return locations.filter((loc) => normalizeStatus(loc.status) === wanted);
  }, [locations, statusFilter]);

  const center = useMemo(() => averageCenter(visibleLocations), [visibleLocations]);

  useEffect(() => {
    if (!fitted && visibleLocations.length > 0) setFitted(true);
  }, [visibleLocations, fitted]);

  return (
    <div className={`${styles.wrap} bg-white shadow-sm rounded overflow-hidden`}>
      <div className="d-flex justify-content-between align-items-center px-2 py-1 border-bottom">
        <h6 className="mb-0" style={{ fontSize: '0.8rem' }}>
          Live Map
        </h6>
        {loading && <Spinner animation="border" size="sm" />}
      </div>
      <div className={styles.mapBox}>
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
      {/* ✅ Legend matches the four KPI accents */}
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
