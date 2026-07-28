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
