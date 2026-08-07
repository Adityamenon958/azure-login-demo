/**
 * Route templates + interpolation helpers.
 */

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function bearingDegrees(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Linear interpolate between two points (good enough for short demo legs). */
function interpolate(lat1, lon1, lat2, lon2, t) {
  const u = Math.max(0, Math.min(1, t));
  return {
    lat: lat1 + (lat2 - lat1) * u,
    lon: lon1 + (lon2 - lon1) * u,
  };
}

function wp(id, name, lat, lon, stopDurationMinutes = 12) {
  return { id, name, lat, lon, stopDurationMinutes, placeQuery: name };
}

/**
 * Build waypoint list from routeType + base coords + optional custom waypoints.
 */
function buildWaypoints({ routeType, baseLat, baseLon, customWaypoints, defaultStopMinutes }) {
  const lat = Number(baseLat) || 19.04598;
  const lon = Number(baseLon) || 73.027397;
  const stop = defaultStopMinutes != null ? Number(defaultStopMinutes) : 12;

  if (routeType === 'custom' && Array.isArray(customWaypoints) && customWaypoints.length >= 2) {
    return customWaypoints.map((w, i) => ({
      id: w.id || `wp-${i}`,
      name: w.name || `Stop ${i + 1}`,
      lat: Number(w.lat),
      lon: Number(w.lon),
      stopDurationMinutes: w.stopDurationMinutes != null ? Number(w.stopDurationMinutes) : stop,
      placeQuery: w.placeQuery || w.name || '',
    }));
  }

  if (routeType === 'aToBReturn') {
    return [
      wp('home', 'Warehouse', lat, lon, stop),
      wp('dest', 'Client Site', lat + 0.028, lon + 0.022, stop + 5),
      wp('home2', 'Warehouse', lat, lon, stop),
    ];
  }

  if (routeType === 'circular') {
    const r = 0.018;
    return [
      wp('c0', 'Depot', lat, lon, 5),
      wp('c1', 'North Gate', lat + r, lon, 4),
      wp('c2', 'East Point', lat, lon + r, 4),
      wp('c3', 'South Loop', lat - r, lon, 4),
      wp('c4', 'West Point', lat, lon - r, 4),
      wp('c5', 'Depot', lat, lon, 8),
    ];
  }

  // multiStop (default)
  return [
    wp('wh', 'Warehouse', lat, lon, stop),
    wp('a', 'Client A', lat + 0.022, lon + 0.015, stop),
    wp('b', 'Client B', lat - 0.012, lon + 0.028, stop),
    wp('fuel', 'Fuel Station', lat + 0.008, lon + 0.01, Math.max(5, stop - 5)),
    wp('wh2', 'Warehouse', lat, lon, stop),
  ];
}

function nextIndex(i, len) {
  if (len <= 1) return 0;
  return (i + 1) % len;
}

module.exports = {
  haversineMeters,
  bearingDegrees,
  interpolate,
  buildWaypoints,
  nextIndex,
};
