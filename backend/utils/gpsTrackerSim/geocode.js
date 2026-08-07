/**
 * Provider-agnostic place resolve. V1: demo catalog around Navi Mumbai.
 * Swap `resolvePlace` implementation later for a real geocoder.
 */

const DEMO_PLACES = [
  { query: 'warehouse', label: 'Warehouse', lat: 19.04598, lon: 73.027397 },
  { query: 'office', label: 'Office', lat: 19.059, lon: 73.022 },
  { query: 'client a', label: 'Client A', lat: 19.072, lon: 73.041 },
  { query: 'client b', label: 'Client B', lat: 19.033, lon: 73.055 },
  { query: 'fuel station', label: 'Fuel Station', lat: 19.051, lon: 73.038 },
  { query: 'airport', label: 'Airport', lat: 19.0896, lon: 72.8656 },
  { query: 'hospital', label: 'Hospital', lat: 19.0405, lon: 73.0298 },
  { query: 'mall', label: 'Mall', lat: 19.0635, lon: 73.0012 },
  { query: 'depot', label: 'Depot', lat: 19.04598, lon: 73.027397 },
];

function listDemoPlaces() {
  return DEMO_PLACES.map((p) => ({ ...p }));
}

/**
 * @param {string} query
 * @param {{ regionHint?: { lat: number, lon: number } }} [opts]
 * @returns {{ lat: number, lon: number, label: string, placeQuery: string } | null}
 */
function resolvePlace(query, opts = {}) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return null;

  const hit = DEMO_PLACES.find(
    (p) => p.query === q || p.label.toLowerCase() === q || p.query.includes(q) || p.label.toLowerCase().includes(q)
  );
  if (hit) {
    return { lat: hit.lat, lon: hit.lon, label: hit.label, placeQuery: query };
  }

  // Fallback: offset from region hint / default warehouse
  const base = opts.regionHint || { lat: 19.04598, lon: 73.027397 };
  const hash = [...q].reduce((a, c) => a + c.charCodeAt(0), 0);
  const lat = base.lat + ((hash % 50) - 25) * 0.0008;
  const lon = base.lon + ((hash % 40) - 20) * 0.0008;
  return {
    lat: Math.round(lat * 1e6) / 1e6,
    lon: Math.round(lon * 1e6) / 1e6,
    label: String(query).trim(),
    placeQuery: query,
  };
}

module.exports = { listDemoPlaces, resolvePlace, DEMO_PLACES };
