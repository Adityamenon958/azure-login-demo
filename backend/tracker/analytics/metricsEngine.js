/**
 * Pure metrics engine for fleet analytics rollups.
 * Reuses journey helpers (buildRawPoints, detectStops, computeDistance) — no duplicate math.
 */
const {
  buildRawPoints,
  detectStops,
  computeDistance,
} = require('../services/trackerJourneyService');
const { calculateDistanceMeters } = require('../utils/geo');
const { MOVING_SPEED_KMH } = require('../constants/trackerStatus');
const { istHourStart, istHourKey } = require('./dateHelpers');

const ENGINE_VERSION = 1;
const GPS_GAP_MS = 15 * 60 * 1000;
const TRIP_MIN_MS = 2 * 60 * 1000;
const TRIP_MIN_M = 200;
const HOUR_MS = 3600000;

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Time-weighted engine ON / OFF between consecutive points.
 */
function computeEngineDurations(raw) {
  let engineOnMs = 0;
  let engineOffMs = 0;
  for (let i = 1; i < raw.length; i += 1) {
    const dt = Math.max(0, raw[i].ts - raw[i - 1].ts);
    if (raw[i - 1].ignition) engineOnMs += dt;
    else engineOffMs += dt;
  }
  return { engineOnMs, engineOffMs };
}

/**
 * Moving duration (same edge logic as journey drivingMs).
 */
function computeMovingMs(raw) {
  let movingMs = 0;
  for (let i = 1; i < raw.length; i += 1) {
    if (raw[i - 1].moving) {
      movingMs += Math.max(0, raw[i].ts - raw[i - 1].ts);
    }
  }
  return movingMs;
}

function computeLongestDriveMs(raw) {
  let longest = 0;
  let segStart = null;
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i].moving) {
      if (segStart == null) segStart = raw[i].ts;
    } else if (segStart != null) {
      longest = Math.max(longest, raw[i].ts - segStart);
      segStart = null;
    }
  }
  if (segStart != null && raw.length) {
    longest = Math.max(longest, raw[raw.length - 1].ts - segStart);
  }
  return longest;
}

function computeTripCount(raw) {
  let tripCount = 0;
  let segStart = null;
  let segDist = 0;
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i].moving) {
      if (segStart == null) segStart = raw[i].ts;
      if (i > 0) {
        segDist += calculateDistanceMeters(
          raw[i - 1].lat,
          raw[i - 1].lon,
          raw[i].lat,
          raw[i].lon
        );
      }
    } else if (segStart != null) {
      const dur = raw[i].ts - segStart;
      if (dur >= TRIP_MIN_MS || segDist >= TRIP_MIN_M) tripCount += 1;
      segStart = null;
      segDist = 0;
    }
  }
  if (segStart != null && raw.length) {
    const dur = raw[raw.length - 1].ts - segStart;
    if (dur >= TRIP_MIN_MS || segDist >= TRIP_MIN_M) tripCount += 1;
  }
  return tripCount;
}

function computeGpsGapMs(raw) {
  let gpsGapMs = 0;
  for (let i = 1; i < raw.length; i += 1) {
    const gap = raw[i].ts - raw[i - 1].ts;
    if (gap >= GPS_GAP_MS) gpsGapMs += gap;
  }
  return gpsGapMs;
}

function odometerEndKm(raw) {
  const last = [...raw].reverse().find((p) => p.totalOdometer != null);
  if (last == null) return null;
  const v = Number(last.totalOdometer);
  if (!Number.isFinite(v)) return null;
  // Teltonika total odometer is typically meters
  return round2(v / 1000);
}

/**
 * Compute one device-day metrics from raw AVL lean docs.
 * @returns {object|null} null if no usable points
 */
function computeDailyMetrics(avlDocs) {
  const raw = buildRawPoints(avlDocs || []);
  if (raw.length === 0) {
    return {
      engineOnMs: 0,
      engineOffMs: 0,
      movingMs: 0,
      idleMs: 0,
      parkedMs: 0,
      distanceKm: 0,
      distanceSource: 'none',
      odometerEndKm: null,
      avgSpeedKmh: 0,
      maxSpeedKmh: 0,
      tripCount: 0,
      stopCount: 0,
      longestDriveMs: 0,
      longestIdleMs: 0,
      pointCount: 0,
      gpsGapMs: 0,
      firstFixAt: null,
      lastFixAt: null,
      activeDays: 1,
      driver: undefined,
      fuel: undefined,
      engineVersion: ENGINE_VERSION,
    };
  }

  const stops = detectStops(raw);
  const { distanceM, distanceSource } = computeDistance(raw);
  const { engineOnMs, engineOffMs } = computeEngineDurations(raw);
  const movingMs = computeMovingMs(raw);

  let idleMs = 0;
  let parkedMs = 0;
  let longestIdleMs = 0;
  for (const s of stops) {
    if (s.kind === 'idle') {
      idleMs += s.durationMs;
      longestIdleMs = Math.max(longestIdleMs, s.durationMs);
    } else {
      parkedMs += s.durationMs;
    }
  }

  let maxSpeed = 0;
  for (const p of raw) {
    if (p.speed > maxSpeed) maxSpeed = p.speed;
  }

  const distanceKm = round2(distanceM / 1000);
  const movingHours = movingMs / 3600000;
  const avgSpeedKmh =
    movingHours > 0 ? round2(distanceKm / movingHours) : 0;

  return {
    engineOnMs,
    engineOffMs,
    movingMs,
    idleMs,
    parkedMs,
    distanceKm,
    distanceSource: distanceSource || 'none',
    odometerEndKm: odometerEndKm(raw),
    avgSpeedKmh,
    maxSpeedKmh: round2(maxSpeed),
    tripCount: computeTripCount(raw),
    stopCount: stops.length,
    longestDriveMs: computeLongestDriveMs(raw),
    longestIdleMs,
    pointCount: raw.length,
    gpsGapMs: computeGpsGapMs(raw),
    firstFixAt: new Date(raw[0].ts),
    lastFixAt: new Date(raw[raw.length - 1].ts),
    activeDays: 1,
    // reserved — null until Phase 4
    driver: undefined,
    fuel: undefined,
    engineVersion: ENGINE_VERSION,
  };
}

/**
 * Split consecutive AVL segments into IST hour buckets (Today trends).
 * Gaps ≥ 15 min are skipped so offline holes are not counted as parked.
 */
function computeHourlyMetrics(avlDocs, { from, to } = {}) {
  const raw = buildRawPoints(avlDocs || []);
  const fromMs = from ? new Date(from).getTime() : (raw[0] ? raw[0].ts : 0);
  const toMs = to ? new Date(to).getTime() : Date.now();
  const buckets = new Map();

  function getBucket(ts) {
    const start = istHourStart(ts);
    const key = istHourKey(start);
    if (!buckets.has(key)) {
      buckets.set(key, {
        periodKey: key,
        periodStart: start,
        engineOnMs: 0,
        movingMs: 0,
        idleMs: 0,
        parkedMs: 0,
        distanceKm: 0,
        granularity: 'hour',
      });
    }
    return buckets.get(key);
  }

  for (let i = 1; i < raw.length; i += 1) {
    const prev = raw[i - 1];
    const curr = raw[i];
    const dt = curr.ts - prev.ts;
    if (dt <= 0 || dt >= GPS_GAP_MS) continue;

    const distKm = calculateDistanceMeters(prev.lat, prev.lon, curr.lat, curr.lon) / 1000;
    let a = Math.max(prev.ts, fromMs);
    const b = Math.min(curr.ts, toMs);
    if (b <= a) continue;

    while (a < b) {
      const hourEnd = istHourStart(a).getTime() + HOUR_MS;
      const sliceEnd = Math.min(b, hourEnd);
      const sliceMs = sliceEnd - a;
      const bucket = getBucket(a);
      if (prev.moving) bucket.movingMs += sliceMs;
      else if (prev.ignition) bucket.idleMs += sliceMs;
      else bucket.parkedMs += sliceMs;
      if (prev.ignition) bucket.engineOnMs += sliceMs;
      bucket.distanceKm += distKm * (sliceMs / dt);
      a = sliceEnd;
    }
  }

  return [...buckets.values()]
    .sort((a, b) => a.periodStart - b.periodStart)
    .map((b) => ({ ...b, distanceKm: round2(b.distanceKm) }));
}

/**
 * Aggregate an array of day (or month) metric docs into a higher rollup.
 */
function aggregatePeriodMetrics(docs) {
  const list = docs || [];
  if (list.length === 0) {
    return computeDailyMetrics([]);
  }

  let engineOnMs = 0;
  let engineOffMs = 0;
  let movingMs = 0;
  let idleMs = 0;
  let parkedMs = 0;
  let distanceKm = 0;
  let tripCount = 0;
  let stopCount = 0;
  let longestDriveMs = 0;
  let longestIdleMs = 0;
  let pointCount = 0;
  let gpsGapMs = 0;
  let maxSpeedKmh = 0;
  let activeDays = 0;
  let firstFixAt = null;
  let lastFixAt = null;
  let odometerEndKm = null;
  const sources = new Set();

  for (const d of list) {
    engineOnMs += d.engineOnMs || 0;
    engineOffMs += d.engineOffMs || 0;
    movingMs += d.movingMs || 0;
    idleMs += d.idleMs || 0;
    parkedMs += d.parkedMs || 0;
    distanceKm += d.distanceKm || 0;
    tripCount += d.tripCount || 0;
    stopCount += d.stopCount || 0;
    longestDriveMs = Math.max(longestDriveMs, d.longestDriveMs || 0);
    longestIdleMs = Math.max(longestIdleMs, d.longestIdleMs || 0);
    pointCount += d.pointCount || 0;
    gpsGapMs += d.gpsGapMs || 0;
    maxSpeedKmh = Math.max(maxSpeedKmh, d.maxSpeedKmh || 0);
    if (d.activeDays != null) activeDays += d.activeDays;
    else if ((d.pointCount || 0) > 0) activeDays += 1;
    if (d.distanceSource && d.distanceSource !== 'none') sources.add(d.distanceSource);
    if (d.firstFixAt) {
      const t = new Date(d.firstFixAt);
      if (!firstFixAt || t < firstFixAt) firstFixAt = t;
    }
    if (d.lastFixAt) {
      const t = new Date(d.lastFixAt);
      if (!lastFixAt || t > lastFixAt) lastFixAt = t;
    }
    if (d.odometerEndKm != null) {
      if (odometerEndKm == null || d.odometerEndKm > odometerEndKm) {
        odometerEndKm = d.odometerEndKm;
      }
    }
  }

  const movingHours = movingMs / 3600000;
  const avgSpeedKmh =
    movingHours > 0 ? round2(distanceKm / movingHours) : 0;

  let distanceSource = 'none';
  if (sources.size === 1) distanceSource = [...sources][0];
  else if (sources.size > 1) distanceSource = 'mixed';

  return {
    engineOnMs,
    engineOffMs,
    movingMs,
    idleMs,
    parkedMs,
    distanceKm: round2(distanceKm),
    distanceSource,
    odometerEndKm,
    avgSpeedKmh,
    maxSpeedKmh: round2(maxSpeedKmh),
    tripCount,
    stopCount,
    longestDriveMs,
    longestIdleMs,
    pointCount,
    gpsGapMs,
    firstFixAt,
    lastFixAt,
    activeDays,
    driver: undefined,
    fuel: undefined,
    engineVersion: ENGINE_VERSION,
  };
}

module.exports = {
  ENGINE_VERSION,
  MOVING_SPEED_KMH,
  computeDailyMetrics,
  computeHourlyMetrics,
  aggregatePeriodMetrics,
  computeEngineDurations,
};
