import React, { memo, useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Spinner } from 'react-bootstrap';
import { STATUS_COLORS } from '../../constants/trackerStatus';
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

function createStatusIcon(status) {
  const color = STATUS_COLORS[status] || STATUS_COLORS.offline;
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
          <div className="fw-bold mb-1">{loc.deviceId}</div>
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
}) {
  const [fitted, setFitted] = useState(false);
  const center = useMemo(() => averageCenter(locations), [locations]);

  useEffect(() => {
    if (!fitted && locations.length > 0) setFitted(true);
  }, [locations, fitted]);

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
          <FitOnce center={center} shouldFit={!fitted && locations.length > 0} />
          {locations.map((loc) => (
            <TrackerMarker
              key={loc.deviceId}
              loc={loc}
              selected={selectedDeviceId === loc.deviceId}
              onSelect={onSelect}
            />
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
