/**
 * OSRM road routing for fleet GPS simulator legs.
 * Cache in process memory; never call from inside advanceTick math.
 */

const { haversineMeters, polylineLengthMeters } = require('./routes');

const legCache = new Map();

function isOsrmEnabled() {
  const flag = process.env.OSRM_ENABLED;
  if (flag === 'false') return false;
  return true;
}

function getOsrmBaseUrl() {
  return (process.env.OSRM_BASE_URL || 'https://router.project-osrm.org').replace(/\/$/, '');
}

function getOsrmTimeoutMs() {
  const n = parseInt(process.env.OSRM_TIMEOUT_MS, 10);
  return Number.isFinite(n) && n > 0 ? n : 4000;
}

function roundCoord(n) {
  return Math.round(Number(n) * 1e5) / 1e5;
}

function legKey(from, to) {
  return `${roundCoord(from.lat)},${roundCoord(from.lon)}→${roundCoord(to.lat)},${roundCoord(to.lon)}`;
}

function getCachedLeg(key) {
  return legCache.get(key) || null;
}

function setCachedLeg(key, value) {
  legCache.set(key, value);
  return value;
}

function buildStraightLeg(from, to) {
  const points = [
    { lat: Number(from.lat), lon: Number(from.lon) },
    { lat: Number(to.lat), lon: Number(to.lon) },
  ];
  return {
    points,
    distanceM: haversineMeters(points[0].lat, points[0].lon, points[1].lat, points[1].lon) || 1,
    source: 'straight',
    key: legKey(from, to),
  };
}

async function fetchOsrmLeg(from, to, { signal } = {}) {
  const base = getOsrmBaseUrl();
  const coords = `${Number(from.lon)},${Number(from.lat)};${Number(to.lon)},${Number(to.lat)}`;
  const url = `${base}/route/v1/driving/${coords}?overview=full&geometries=geojson`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!res.ok) {
    throw new Error(`OSRM HTTP ${res.status}`);
  }
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.[0]?.geometry?.coordinates?.length) {
    throw new Error(`OSRM code=${data.code || 'empty'}`);
  }

  const points = data.routes[0].geometry.coordinates.map(([lon, lat]) => ({
    lat: Number(lat),
    lon: Number(lon),
  }));
  if (points.length < 2) {
    throw new Error('OSRM geometry too short');
  }

  const distanceM =
    Number(data.routes[0].distance) || polylineLengthMeters(points) || 1;

  return {
    points,
    distanceM,
    source: 'osrm',
    key: legKey(from, to),
  };
}

/**
 * Always returns usable geometry (OSRM or straight fallback).
 */
async function ensureLegGeometry(from, to, opts = {}) {
  const key = legKey(from, to);
  const cached = getCachedLeg(key);
  if (cached?.points?.length >= 2) {
    return { ...cached, key };
  }

  if (!isOsrmEnabled()) {
    const straight = buildStraightLeg(from, to);
    setCachedLeg(key, straight);
    return straight;
  }

  const timeoutMs = opts.timeoutMs != null ? opts.timeoutMs : getOsrmTimeoutMs();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const leg = await fetchOsrmLeg(from, to, { signal: controller.signal });
    setCachedLeg(key, leg);
    console.log(`[sim] 🗺️ OSRM leg ok ${key} points=${leg.points.length} dist=${Math.round(leg.distanceM)}m`);
    return leg;
  } catch (err) {
    const msg = err?.name === 'AbortError' ? 'timeout' : (err.message || String(err));
    console.warn(`[sim] ⚠️ OSRM leg failed (${msg}) — straight fallback for ${key}`);
    const straight = buildStraightLeg(from, to);
    setCachedLeg(key, straight);
    return straight;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Prefetch unique consecutive waypoint pairs (including wrap).
 */
async function prefetchLegsForWaypoints(waypoints, { concurrency = 2 } = {}) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    return { warmed: 0, failed: 0, total: 0 };
  }

  const pairs = [];
  const seen = new Set();
  for (let i = 0; i < waypoints.length; i += 1) {
    const from = waypoints[i];
    const to = waypoints[(i + 1) % waypoints.length];
    const key = legKey(from, to);
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ from, to, key });
  }

  let warmed = 0;
  let failed = 0;
  let idx = 0;

  async function worker() {
    while (idx < pairs.length) {
      const current = pairs[idx];
      idx += 1;
      try {
        const leg = await ensureLegGeometry(current.from, current.to);
        if (leg.source === 'osrm') warmed += 1;
        else failed += 1;
      } catch (_) {
        failed += 1;
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, pairs.length) }, () => worker());
  await Promise.all(workers);
  return { warmed, failed, total: pairs.length };
}

/**
 * Attach active leg geometry onto a sim object for the current waypoint index.
 */
async function attachActiveLegToSim(sim) {
  const { getProfile } = require('./profiles');
  const { buildWaypoints, nextIndex } = require('./routes');

  let waypoints = Array.isArray(sim.waypoints) && sim.waypoints.length >= 2
    ? sim.waypoints
    : null;
  if (!waypoints) {
    const profile = getProfile(sim.behaviourProfile);
    waypoints = buildWaypoints({
      routeType: sim.routeType || profile.routeType,
      baseLat: sim.latitude,
      baseLon: sim.longitude,
      customWaypoints: sim.waypoints,
      defaultStopMinutes: sim.defaultStopMinutes || profile.defaultStopMinutes,
    });
  }

  const idx = Math.min(sim.currentWaypointIndex || 0, waypoints.length - 1);
  const nextIdx = nextIndex(idx, waypoints.length);
  const here = waypoints[idx];
  const next = waypoints[nextIdx];
  const key = legKey(here, next);

  if (
    sim.activeLegKey === key
    && Array.isArray(sim.activeLegGeometry)
    && sim.activeLegGeometry.length >= 2
  ) {
    return sim;
  }

  const leg = await ensureLegGeometry(here, next);
  return {
    ...sim,
    activeLegKey: key,
    activeLegGeometry: leg.points,
    activeLegDistanceM: leg.distanceM,
    activeLegSource: leg.source,
  };
}

module.exports = {
  legKey,
  getCachedLeg,
  setCachedLeg,
  buildStraightLeg,
  fetchOsrmLeg,
  ensureLegGeometry,
  prefetchLegsForWaypoints,
  attachActiveLegToSim,
  isOsrmEnabled,
  getOsrmBaseUrl,
};
