import { normalizeStatus } from '../constants/trackerStatus';

/**
 * Shared client-side filter for Tracker table + Fleet Map list/map.
 * Search: displayName, deviceId, uid, deviceModel, imeiMasked
 * Status: all | moving | idle | parked | needsAttention
 */
export function filterDevices(devices = [], { search = '', status = 'all' } = {}) {
  let rows = Array.isArray(devices) ? [...devices] : [];
  const q = String(search || '').trim().toLowerCase();

  if (q) {
    rows = rows.filter(
      (d) =>
        String(d.displayName || '').toLowerCase().includes(q) ||
        String(d.deviceId || '').toLowerCase().includes(q) ||
        String(d.uid || '').toLowerCase().includes(q) ||
        String(d.deviceModel || '').toLowerCase().includes(q) ||
        String(d.imeiMasked || '').toLowerCase().includes(q)
    );
  }

  if (status && status !== 'all') {
    const wanted = normalizeStatus(status);
    rows = rows.filter((d) => normalizeStatus(d.status) === wanted);
  }

  return rows;
}

/**
 * Filter live locations with the same search + status rules as devices.
 * Uses displayName / deviceId / deviceModel / imeiMasked when present on location rows.
 */
export function filterLocations(locations = [], { search = '', status = 'all' } = {}) {
  return filterDevices(locations, { search, status });
}
