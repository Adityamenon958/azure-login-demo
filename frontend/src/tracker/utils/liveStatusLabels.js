/**
 * ✅ Human-readable live status labels from Teltonika AVL meanings.
 * Sources: Teltonika wiki — IO 69 GNSS Status, IO 21 GSM Signal (scale 1–5).
 */

/**
 * GNSS Status (AVL ID 69):
 * 0 - GNSS OFF
 * 1 - GNSS ON with fix
 * 2 - GNSS ON without fix
 * 3 - GNSS sleep
 * 4 - GNSS ON with an active GNSS filter (newer FW)
 */
export function formatGnssStatus(gnssStatus, { latitude, longitude } = {}) {
  const n = gnssStatus == null ? null : Number(gnssStatus);
  if (n === 0) return 'GPS Off';
  if (n === 1) return 'GPS Locked';
  if (n === 2) return 'Searching…';
  if (n === 3) return 'GPS Sleep';
  if (n === 4) return 'GPS Locked';

  // Fallback when IO 69 missing: use coordinates
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0)) {
    return 'GPS Locked';
  }
  if (gnssStatus == null) return '—';
  return 'No GPS Fix';
}

/**
 * GSM Signal (AVL ID 21): unsigned scale 1–5 (0 = no signal / unavailable).
 */
export function formatGsmSignal(gsmSignal) {
  if (gsmSignal == null || Number.isNaN(Number(gsmSignal))) return '—';
  const n = Math.round(Number(gsmSignal));
  if (n <= 0) return 'No Signal';
  if (n === 1) return 'Weak';
  if (n === 2) return 'Fair';
  if (n === 3) return 'Good';
  if (n === 4) return 'Good';
  if (n >= 5) return 'Excellent';
  return '—';
}

/** Movement IO 240 → fleet-friendly wording */
export function formatMovement(movement) {
  return movement ? 'Moving' : 'Stationary';
}

/**
 * Heading / angle in degrees → "90° (East)" style (8-point cardinal).
 */
export function formatHeadingCardinal(deg) {
  if (deg == null || Number.isNaN(Number(deg))) return '—';
  const d = ((Number(deg) % 360) + 360) % 360;
  const rounded = Math.round(d);
  const dirs = ['North', 'Northeast', 'East', 'Southeast', 'South', 'Southwest', 'West', 'Northwest'];
  const idx = Math.round(d / 45) % 8;
  return `${rounded}° (${dirs[idx]})`;
}
