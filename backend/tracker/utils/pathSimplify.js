/**
 * ✅ Douglas-Peucker path simplification (lat/lon points).
 * Keeps endpoints; tolerance in meters (approx via Haversine).
 */
const { calculateDistanceMeters } = require('./geo');

function perpendicularDistanceMeters(point, lineStart, lineEnd) {
  const lat = Number(point.lat);
  const lon = Number(point.lon);
  const lat1 = Number(lineStart.lat);
  const lon1 = Number(lineStart.lon);
  const lat2 = Number(lineEnd.lat);
  const lon2 = Number(lineEnd.lon);

  if (lat1 === lat2 && lon1 === lon2) {
    return calculateDistanceMeters(lat, lon, lat1, lon1);
  }

  // Project onto segment using local equirectangular approximation
  const x = lon;
  const y = lat;
  const x1 = lon1;
  const y1 = lat1;
  const x2 = lon2;
  const y2 = lat2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  const projLat = y1 + t * dy;
  const projLon = x1 + t * dx;
  return calculateDistanceMeters(lat, lon, projLat, projLon);
}

/**
 * @param {Array<{ lat: number, lon: number }>} points
 * @param {number} toleranceMeters
 * @returns {number[]} indices to keep (sorted ascending)
 */
function douglasPeuckerIndices(points, toleranceMeters) {
  if (!points || points.length <= 2) {
    return points.map((_, i) => i);
  }

  const keep = new Set([0, points.length - 1]);

  function simplify(start, end) {
    if (end <= start + 1) return;
    let maxDist = 0;
    let maxIdx = start;
    for (let i = start + 1; i < end; i += 1) {
      const d = perpendicularDistanceMeters(points[i], points[start], points[end]);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }
    if (maxDist > toleranceMeters) {
      keep.add(maxIdx);
      simplify(start, maxIdx);
      simplify(maxIdx, end);
    }
  }

  simplify(0, points.length - 1);
  return Array.from(keep).sort((a, b) => a - b);
}

/**
 * Cap path length while always keeping first/last and forced indices.
 * @param {Array<object>} points
 * @param {number} maxPoints
 * @param {Set<number>|number[]} forceIndices
 */
function simplifyPath(points, toleranceMeters = 25, maxPoints = 1500, forceIndices = []) {
  if (!points || points.length === 0) return [];
  if (points.length <= maxPoints) {
    const forced = new Set([0, points.length - 1, ...forceIndices]);
    const idx = douglasPeuckerIndices(points, toleranceMeters);
    for (const i of forced) {
      if (i >= 0 && i < points.length) idx.push(i);
    }
    const unique = Array.from(new Set(idx)).sort((a, b) => a - b);
    return unique.map((i) => ({ ...points[i], _srcIndex: i }));
  }

  // First DP, then thin evenly if still too long
  const forced = new Set([0, points.length - 1, ...forceIndices]);
  let idx = douglasPeuckerIndices(points, toleranceMeters);
  for (const i of forced) {
    if (i >= 0 && i < points.length) idx.push(i);
  }
  idx = Array.from(new Set(idx)).sort((a, b) => a - b);

  if (idx.length > maxPoints) {
    const step = Math.ceil(idx.length / maxPoints);
    const thinned = [];
    for (let i = 0; i < idx.length; i += step) thinned.push(idx[i]);
    if (thinned[thinned.length - 1] !== idx[idx.length - 1]) {
      thinned.push(idx[idx.length - 1]);
    }
    for (const i of forced) {
      if (!thinned.includes(i) && i >= 0 && i < points.length) thinned.push(i);
    }
    idx = Array.from(new Set(thinned)).sort((a, b) => a - b);
  }

  return idx.map((i) => ({ ...points[i], _srcIndex: i }));
}

module.exports = {
  douglasPeuckerIndices,
  simplifyPath,
};
