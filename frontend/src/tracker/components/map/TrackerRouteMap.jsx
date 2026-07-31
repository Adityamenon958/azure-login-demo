import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Form, Spinner } from 'react-bootstrap';
import { STATUS_COLORS, STATUS_LABELS } from '../../constants/trackerStatus';
import { formatCoords, formatDurationMs, formatIst, formatSpeed } from '../../utils/formatters';
import { getGoogleMapsUrl, isValidCoordinates } from '../../utils/mapHelpers';
import ScrollWheelZoomOnFocus from './ScrollWheelZoomOnFocus';
import styles from './TrackerRouteMap.module.css';

function makeDivIcon(label, color) {
  return L.divIcon({
    className: styles.marker,
    html: `<div style="width:22px;height:22px;border-radius:50%;background:${color};color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700">${label}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function FitBounds({ bounds, path, trigger }) {
  const map = useMap();
  // ✅ Only re-fit when trigger bumps (user range / Fit / Refresh) — not on soft path updates
  useEffect(() => {
    if (!path || path.length === 0) return;
    if (bounds) {
      map.fitBounds(
        [
          [bounds.south, bounds.west],
          [bounds.north, bounds.east],
        ],
        { padding: [28, 28], maxZoom: 16 }
      );
    } else {
      const latLngs = path.map((p) => [p.lat, p.lon]);
      map.fitBounds(latLngs, { padding: [28, 28], maxZoom: 16 });
    }
    // path/bounds intentionally omitted — soft refresh must preserve viewport
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, trigger]);
  return null;
}

function FollowLive({ enabled, liveLat, liveLon }) {
  const map = useMap();
  useEffect(() => {
    if (enabled && liveLat != null && liveLon != null) {
      map.panTo([liveLat, liveLon]);
    }
  }, [enabled, liveLat, liveLon, map]);
  return null;
}

/**
 * ✅ When timeline/event selects a point, fly the map there (with time popup).
 * `nonce` bumps on every click so re-selecting the same row still re-focuses.
 */
function FocusSelection({ lat, lon, nonce, zoom = 15 }) {
  const map = useMap();
  useEffect(() => {
    if (nonce == null || nonce === 0) return;
    if (!isValidCoordinates(lat, lon)) return;
    const targetZoom = Math.max(map.getZoom(), zoom);
    map.flyTo([Number(lat), Number(lon)], targetZoom, { duration: 0.5 });
  }, [lat, lon, nonce, zoom, map]);
  return null;
}

function SelectedPointMarker({ point }) {
  const markerRef = useRef(null);

  useEffect(() => {
    if (!point || !markerRef.current) return;
    // Open after Leaflet mounts the marker / finishes flyTo
    const id = window.setTimeout(() => {
      markerRef.current?.openPopup?.();
    }, 350);
    return () => window.clearTimeout(id);
  }, [point?.lat, point?.lon, point?.t, point?.title]);

  if (!point || !isValidCoordinates(point.lat, point.lon)) return null;

  return (
    <CircleMarker
      ref={markerRef}
      center={[point.lat, point.lon]}
      radius={9}
      pathOptions={{ color: '#0f172a', fillColor: '#38bdf8', fillOpacity: 1, weight: 2 }}
    >
      <Popup>
        <div style={{ fontSize: '0.75rem', minWidth: 120 }}>
          <div className="fw-bold">{point.title || 'Selected'}</div>
          <div>{formatIst(point.t)}</div>
          {point.speed != null && <div>{formatSpeed(point.speed)}</div>}
          <div className="text-muted">{formatCoords(point.lat, point.lon)}</div>
        </div>
      </Popup>
    </CircleMarker>
  );
}

const StopMarker = memo(function StopMarker({ stop, selected, onSelect }) {
  const color = stop.kind === 'idle' ? STATUS_COLORS.idle : STATUS_COLORS.parked;
  return (
    <CircleMarker
      center={[stop.lat, stop.lon]}
      radius={selected ? 10 : 7}
      pathOptions={{
        color: selected ? '#0f172a' : '#fff',
        weight: selected ? 3 : 2,
        fillColor: color,
        fillOpacity: 0.95,
      }}
      eventHandlers={{ click: () => onSelect?.(stop) }}
    >
      <Popup>
        <div style={{ fontSize: '0.75rem', minWidth: 140 }}>
          <div className="fw-bold">{STATUS_LABELS[stop.kind] || stop.kind}</div>
          <div>{formatDurationMs(stop.durationMs)}</div>
          <div className="text-muted">{formatIst(stop.arrivedAt)}</div>
          <div className="text-muted">→ {formatIst(stop.departedAt)}</div>
          <div>{formatCoords(stop.lat, stop.lon)}</div>
          <a href={getGoogleMapsUrl(stop.lat, stop.lon)} target="_blank" rel="noreferrer">
            Open in Maps
          </a>
        </div>
      </Popup>
    </CircleMarker>
  );
});

export default function TrackerRouteMap({
  path = [],
  stops = [],
  bounds,
  liveState,
  loading,
  softLoading = false,
  fitTrigger = 0,
  selectedStopId,
  selectedPathIndex,
  focusNonce = 0,
  focusMeta = null,
  onSelectStop,
  onSelectPathIndex,
}) {
  const [showPath, setShowPath] = useState(true);
  const [showStops, setShowStops] = useState(true);
  const [showLive, setShowLive] = useState(true);
  const [followLive, setFollowLive] = useState(false);
  const [localFitKey, setLocalFitKey] = useState(0);

  // ✅ Timeline / stop focus should not fight "Follow live"
  useEffect(() => {
    if (focusNonce > 0) setFollowLive(false);
  }, [focusNonce]);

  const positions = useMemo(() => path.map((p) => [p.lat, p.lon]), [path]);
  const center = useMemo(() => {
    if (path.length > 0) return [path[0].lat, path[0].lon];
    if (liveState?.latitude != null) return [liveState.latitude, liveState.longitude];
    return [20.5937, 78.9629];
  }, [path, liveState]);

  const startIcon = useMemo(() => makeDivIcon('S', STATUS_COLORS.parked), []);
  const endIcon = useMemo(() => makeDivIcon('E', STATUS_COLORS.moving), []);
  const liveColor = STATUS_COLORS[liveState?.status] || STATUS_COLORS.needsAttention;
  const liveIcon = useMemo(() => makeDivIcon('●', liveColor), [liveColor]);

  const hasLiveCoords = isValidCoordinates(liveState?.latitude, liveState?.longitude);
  const combinedFitTrigger = fitTrigger + localFitKey;
  const showMap = path.length > 0 || loading;

  // ✅ Resolve highlight point: path index → stop → explicit focus coords from timeline
  const selectedPoint = useMemo(() => {
    if (selectedPathIndex != null && path[selectedPathIndex]) {
      const p = path[selectedPathIndex];
      return {
        lat: p.lat,
        lon: p.lon,
        t: p.t,
        speed: p.speed,
        title: focusMeta?.title || 'Point on route',
      };
    }
    if (selectedStopId) {
      const stop = stops.find((s) => s.id === selectedStopId);
      if (stop && isValidCoordinates(stop.lat, stop.lon)) {
        return {
          lat: stop.lat,
          lon: stop.lon,
          t: stop.arrivedAt,
          speed: null,
          title: focusMeta?.title || (stop.kind === 'idle' ? 'Idle' : 'Parked'),
        };
      }
    }
    if (focusMeta && isValidCoordinates(focusMeta.lat, focusMeta.lon)) {
      return {
        lat: focusMeta.lat,
        lon: focusMeta.lon,
        t: focusMeta.t,
        speed: focusMeta.speed ?? null,
        title: focusMeta.title || 'Selected',
      };
    }
    return null;
  }, [selectedPathIndex, path, selectedStopId, stops, focusMeta]);

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <h6 className="mb-0" style={{ fontSize: '0.8rem', fontWeight: 600 }}>
          Route history
        </h6>
        <div className={styles.controls}>
          <div className={styles.switches}>
            <Form.Check
              type="switch"
              id="route-path"
              label="Path"
              checked={showPath}
              onChange={(e) => setShowPath(e.target.checked)}
              className={styles.switch}
            />
            <Form.Check
              type="switch"
              id="route-stops"
              label="Stops"
              checked={showStops}
              onChange={(e) => setShowStops(e.target.checked)}
              className={styles.switch}
            />
            <Form.Check
              type="switch"
              id="route-live"
              label="Live"
              checked={showLive}
              onChange={(e) => setShowLive(e.target.checked)}
              className={styles.switch}
            />
            <Form.Check
              type="switch"
              id="route-follow"
              label="Follow live"
              checked={followLive}
              disabled={!hasLiveCoords}
              onChange={(e) => setFollowLive(e.target.checked)}
              className={styles.switch}
            />
          </div>
          <button
            type="button"
            className={styles.fitBtn}
            onClick={() => setLocalFitKey((k) => k + 1)}
            disabled={path.length === 0}
          >
            Fit
          </button>
        </div>
      </div>

      <div className={styles.mapBox}>
        {!showMap ? (
          <div className={styles.empty}>
            <div>No GPS points in this range</div>
            <div className={styles.emptyHint}>Try a wider time range or Refresh.</div>
          </div>
        ) : (
          <>
            {(loading || softLoading) && (
              <div className={styles.overlay}>
                <Spinner animation="border" size="sm" />
              </div>
            )}
            <MapContainer
              center={center}
              zoom={12}
              style={{ height: '100%', width: '100%' }}
              zoomControl
              scrollWheelZoom={false}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <ScrollWheelZoomOnFocus />
              <FitBounds bounds={bounds} path={path} trigger={combinedFitTrigger} />
              <FollowLive
                enabled={followLive && hasLiveCoords}
                liveLat={liveState?.latitude}
                liveLon={liveState?.longitude}
              />
              <FocusSelection
                lat={selectedPoint?.lat}
                lon={selectedPoint?.lon}
                nonce={focusNonce}
              />
              {showPath && positions.length > 1 && (
                <Polyline
                  positions={positions}
                  pathOptions={{ color: STATUS_COLORS.moving, weight: 4, opacity: 0.9 }}
                  eventHandlers={{
                    click: (e) => {
                      let best = 0;
                      let bestD = Infinity;
                      path.forEach((p, i) => {
                        const d =
                          (p.lat - e.latlng.lat) ** 2 + (p.lon - e.latlng.lng) ** 2;
                        if (d < bestD) {
                          bestD = d;
                          best = i;
                        }
                      });
                      onSelectPathIndex?.(best);
                    },
                  }}
                />
              )}
              {showPath && path.length > 0 && (
                <Marker position={[path[0].lat, path[0].lon]} icon={startIcon}>
                  <Popup>
                    <div style={{ fontSize: '0.75rem' }}>
                      <strong>Start</strong>
                      <div>{formatIst(path[0].t)}</div>
                      <div>{formatCoords(path[0].lat, path[0].lon)}</div>
                    </div>
                  </Popup>
                </Marker>
              )}
              {showPath && path.length > 1 && (
                <Marker
                  position={[path[path.length - 1].lat, path[path.length - 1].lon]}
                  icon={endIcon}
                >
                  <Popup>
                    <div style={{ fontSize: '0.75rem' }}>
                      <strong>End</strong>
                      <div>{formatIst(path[path.length - 1].t)}</div>
                      <div>{formatSpeed(path[path.length - 1].speed)}</div>
                    </div>
                  </Popup>
                </Marker>
              )}
              {showStops &&
                stops.map((stop) => (
                  <StopMarker
                    key={stop.id}
                    stop={stop}
                    selected={selectedStopId === stop.id}
                    onSelect={onSelectStop}
                  />
                ))}
              {showLive && hasLiveCoords && (
                <Marker
                  position={[liveState.latitude, liveState.longitude]}
                  icon={liveIcon}
                  zIndexOffset={1000}
                >
                  <Popup>
                    <div style={{ fontSize: '0.75rem' }}>
                      <strong>Live</strong>
                      <div>{STATUS_LABELS[liveState.status] || liveState.status}</div>
                      <div>{formatSpeed(liveState.speed)}</div>
                    </div>
                  </Popup>
                </Marker>
              )}
              <SelectedPointMarker point={selectedPoint} />
            </MapContainer>
          </>
        )}
      </div>

      <div className={styles.legend}>
        <span>
          <i style={{ background: STATUS_COLORS.moving }} /> Moving path
        </span>
        <span>
          <i style={{ background: STATUS_COLORS.idle }} /> Idle stop
        </span>
        <span>
          <i style={{ background: STATUS_COLORS.parked }} /> Parked stop
        </span>
      </div>
    </div>
  );
}
