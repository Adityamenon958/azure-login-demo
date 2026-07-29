export function formatSpeed(speed) {
  if (speed == null || Number.isNaN(Number(speed))) return '—';
  return `${Math.round(Number(speed))} km/h`;
}

export function formatCoords(lat, lon) {
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return '—';
  if (la === 0 && lo === 0) return 'No fix';
  return `${la.toFixed(5)}, ${lo.toFixed(5)}`;
}

export function formatRelativeTime(iso) {
  if (!iso) return 'Never';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Invalid';
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

export function formatIst(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

export function formatDurationMs(ms) {
  if (ms == null || !Number.isFinite(Number(ms)) || ms < 0) return '—';
  const totalMin = Math.round(Number(ms) / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h < 24) return m ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d}d ${rh}h` : `${d}d`;
}

export function formatDistanceKm(km) {
  if (km == null || Number.isNaN(Number(km))) return '—';
  const n = Number(km);
  if (n < 1) return `${Math.round(n * 1000)} m`;
  return `${n.toFixed(1)} km`;
}

export function formatVoltage(v) {
  if (v == null || Number.isNaN(Number(v))) return '—';
  return `${Number(v).toFixed(1)} V`;
}

export function formatHeading(deg) {
  if (deg == null || Number.isNaN(Number(deg))) return '—';
  return `${Math.round(Number(deg))}°`;
}

// Re-export live status helpers for convenience
export {
  formatGnssStatus,
  formatGsmSignal,
  formatMovement,
  formatHeadingCardinal,
} from './liveStatusLabels';
