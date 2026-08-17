/**
 * Incremental IST-day metrics — same numbers as computeDailyMetrics / computeHourlyMetrics
 * without re-reading the whole day's AVL on each ping.
 *
 * Cursor stores the last VALID GPS point + open stop/trip/drive so the next point
 * continues detectStops / computeTripCount / computeLongestDriveMs correctly.
 */
const {
  buildRawPoints,
  STOP_MIN_MS,
  STOP_CLUSTER_M,
  TRIP_MIN_MS,
  TRIP_MIN_M,
} = require('../services/trackerJourneyService');
const { calculateDistanceMeters } = require('../utils/geo');
const {
  ENGINE_VERSION,
  GPS_GAP_MS,
  HOUR_MS,
  addSegmentToTimeBuckets,
  emptyTimeBucket,
  round2,
} = require('./metricsEngine');
const { istAlignedStart, istBucketKey } = require('./dateHelpers');

function cloneCursor(cursor) {
  return cursor ? { ...cursor } : emptyCursor();
}

function emptyCursor() {
  return {
    processedTs: null,
    ts: null,
    lat: null,
    lon: null,
    speed: 0,
    ignition: false,
    movement: false,
    moving: false,
    totalOdometer: null,
    firstOdometer: null,
    haversineM: 0,
    stopArrivedTs: null,
    stopLastTs: null,
    stopSumLat: 0,
    stopSumLon: 0,
    stopN: 0,
    stopIgnitionOn: 0,
    stopCommittedMs: 0,
    stopKind: null,
    tripStartTs: null,
    tripDistM: 0,
    tripCounted: false,
    driveStartTs: null,
  };
}

function emptyDayState() {
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
    activeDays: 0,
    engineVersion: ENGINE_VERSION,
    hourlyBuckets: [],
    cursor: emptyCursor(),
  };
}

function hourlyMapFromArray(list) {
  const map = new Map();
  for (const b of list || []) {
    if (!b?.periodKey) continue;
    map.set(b.periodKey, {
      periodKey: b.periodKey,
      periodStart: new Date(b.periodStart),
      engineOnMs: b.engineOnMs || 0,
      movingMs: b.movingMs || 0,
      idleMs: b.idleMs || 0,
      parkedMs: b.parkedMs || 0,
      distanceKm: b.distanceKm || 0,
      granularity: b.granularity || 'hour',
    });
  }
  return map;
}

function hourlyArrayFromMap(map) {
  return [...map.values()]
    .sort((a, b) => a.periodStart - b.periodStart)
    .map((b) => ({ ...b, distanceKm: round2(b.distanceKm) }));
}

function resolveDistance(cursor) {
  const first = cursor.firstOdometer;
  const last = cursor.totalOdometer;
  if (first != null && last != null && last >= first && last - first > 0) {
    return { distanceM: last - first, distanceSource: 'odometer' };
  }
  if (cursor.haversineM > 0) {
    return { distanceM: cursor.haversineM, distanceSource: 'haversine' };
  }
  return { distanceM: 0, distanceSource: 'none' };
}

function finalizeState(state) {
  const { distanceM, distanceSource } = resolveDistance(state.cursor);
  const distanceKm = round2(distanceM / 1000);
  const movingHours = (state.movingMs || 0) / 3600000;
  const odo = state.cursor.totalOdometer;
  return {
    ...state,
    distanceKm,
    distanceSource,
    odometerEndKm: odo != null && Number.isFinite(Number(odo)) ? round2(Number(odo) / 1000) : null,
    avgSpeedKmh: movingHours > 0 ? round2(distanceKm / movingHours) : 0,
    maxSpeedKmh: round2(state.maxSpeedKmh || 0),
    activeDays: state.pointCount > 0 ? 1 : 0,
    engineVersion: ENGINE_VERSION,
  };
}

function startStop(cursor, point) {
  cursor.stopArrivedTs = point.ts;
  cursor.stopLastTs = point.ts;
  cursor.stopSumLat = point.lat;
  cursor.stopSumLon = point.lon;
  cursor.stopN = 1;
  cursor.stopIgnitionOn = point.ignition ? 1 : 0;
  cursor.stopCommittedMs = 0;
  cursor.stopKind = null;
}

function closeStop(state, cursor) {
  cursor.stopArrivedTs = null;
  cursor.stopLastTs = null;
  cursor.stopSumLat = 0;
  cursor.stopSumLon = 0;
  cursor.stopN = 0;
  cursor.stopIgnitionOn = 0;
  cursor.stopCommittedMs = 0;
  cursor.stopKind = null;
  return state;
}

/**
 * Keep idle/parked totals aligned with detectStops:
 * duration = lastClusterPoint.ts - firstClusterPoint.ts, kind = ignition majority,
 * only committed once duration ≥ 3 minutes. Kind can flip as points arrive.
 */
function syncOpenStop(state, cursor, point) {
  cursor.stopLastTs = point.ts;
  cursor.stopSumLat += point.lat;
  cursor.stopSumLon += point.lon;
  cursor.stopN += 1;
  if (point.ignition) cursor.stopIgnitionOn += 1;

  const durationMs = Math.max(0, point.ts - cursor.stopArrivedTs);
  if (durationMs < STOP_MIN_MS) return;

  const kind = cursor.stopIgnitionOn / cursor.stopN >= 0.5 ? 'idle' : 'parked';
  if (!cursor.stopKind) {
    state.stopCount += 1;
    if (kind === 'idle') state.idleMs += durationMs;
    else state.parkedMs += durationMs;
  } else {
    if (cursor.stopKind === 'idle') state.idleMs -= cursor.stopCommittedMs;
    else state.parkedMs -= cursor.stopCommittedMs;
    if (kind === 'idle') state.idleMs += durationMs;
    else state.parkedMs += durationMs;
  }
  cursor.stopKind = kind;
  cursor.stopCommittedMs = durationMs;
  if (kind === 'idle') {
    state.longestIdleMs = Math.max(state.longestIdleMs || 0, durationMs);
  }
}

function withinStopCluster(cursor, point) {
  if (!cursor.stopN) return false;
  const centerLat = cursor.stopSumLat / cursor.stopN;
  const centerLon = cursor.stopSumLon / cursor.stopN;
  return calculateDistanceMeters(centerLat, centerLon, point.lat, point.lon) <= STOP_CLUSTER_M;
}

function applyValidPoint(state, hourly, prev, curr, { fromMs, toMs }) {
  state.pointCount += 1;
  state.maxSpeedKmh = Math.max(state.maxSpeedKmh || 0, curr.speed || 0);
  state.lastFixAt = new Date(curr.ts);
  if (!state.firstFixAt) state.firstFixAt = new Date(curr.ts);

  const cursor = state.cursor;
  if (curr.totalOdometer != null && Number.isFinite(Number(curr.totalOdometer))) {
    if (cursor.firstOdometer == null) cursor.firstOdometer = Number(curr.totalOdometer);
    cursor.totalOdometer = Number(curr.totalOdometer);
  }

  if (!prev) {
    if (!curr.moving) startStop(cursor, curr);
    else {
      cursor.tripStartTs = curr.ts;
      cursor.tripDistM = 0;
      cursor.tripCounted = false;
      cursor.driveStartTs = curr.ts;
    }
    return;
  }

  const dt = Math.max(0, curr.ts - prev.ts);
  if (dt > 0) {
    if (prev.ignition) state.engineOnMs += dt;
    else state.engineOffMs += dt;
    if (prev.moving) state.movingMs += dt;
    if (dt >= GPS_GAP_MS) state.gpsGapMs += dt;
  }

  const distM = calculateDistanceMeters(prev.lat, prev.lon, curr.lat, curr.lon);
  cursor.haversineM += distM;

  addSegmentToTimeBuckets(
    hourly,
    (ts) => {
      const start = istAlignedStart(ts, HOUR_MS);
      const key = istBucketKey(start, HOUR_MS);
      if (!hourly.has(key)) hourly.set(key, emptyTimeBucket(start, HOUR_MS, 'hour'));
      return hourly.get(key);
    },
    prev,
    curr,
    { fromMs, toMs, step: HOUR_MS }
  );

  // Longest drive — same edges as computeLongestDriveMs
  if (curr.moving) {
    if (cursor.driveStartTs == null) cursor.driveStartTs = curr.ts;
    state.longestDriveMs = Math.max(state.longestDriveMs || 0, curr.ts - cursor.driveStartTs);
  } else if (cursor.driveStartTs != null) {
    state.longestDriveMs = Math.max(state.longestDriveMs || 0, curr.ts - cursor.driveStartTs);
    cursor.driveStartTs = null;
  }

  // Trips — same as computeTripCount (open qualifying trip is counted)
  if (curr.moving) {
    if (cursor.tripStartTs == null) cursor.tripStartTs = curr.ts;
    cursor.tripDistM += distM;
    const dur = curr.ts - cursor.tripStartTs;
    if (!cursor.tripCounted && (dur >= TRIP_MIN_MS || cursor.tripDistM >= TRIP_MIN_M)) {
      state.tripCount += 1;
      cursor.tripCounted = true;
    }
  } else if (cursor.tripStartTs != null) {
    const dur = curr.ts - cursor.tripStartTs;
    if (!cursor.tripCounted && (dur >= TRIP_MIN_MS || cursor.tripDistM >= TRIP_MIN_M)) {
      state.tripCount += 1;
    }
    cursor.tripStartTs = null;
    cursor.tripDistM = 0;
    cursor.tripCounted = false;
  }

  // Stops — same as detectStops clustering
  if (!curr.moving) {
    if (cursor.stopArrivedTs != null && withinStopCluster(cursor, curr)) {
      syncOpenStop(state, cursor, curr);
    } else {
      if (cursor.stopArrivedTs != null) closeStop(state, cursor);
      startStop(cursor, curr);
    }
  } else if (cursor.stopArrivedTs != null) {
    closeStop(state, cursor);
  }
}

function lastValidFromCursor(cursor) {
  if (cursor.ts == null || cursor.lat == null || cursor.lon == null) return null;
  return {
    ts: new Date(cursor.ts).getTime(),
    lat: cursor.lat,
    lon: cursor.lon,
    speed: cursor.speed || 0,
    ignition: cursor.ignition === true,
    movement: cursor.movement === true,
    moving: cursor.moving === true,
    totalOdometer: cursor.totalOdometer,
  };
}

/**
 * Apply one AVL lean doc to an in-memory day state.
 * Idempotent: timestamps ≤ cursor.processedTs are ignored.
 */
function applyIncrementalPoint(stateIn, avlDoc, { from, to } = {}) {
  const state = {
    ...stateIn,
    cursor: cloneCursor(stateIn.cursor),
    hourlyBuckets: (stateIn.hourlyBuckets || []).map((b) => ({ ...b })),
  };
  const raw = buildRawPoints(avlDoc ? [avlDoc] : []);
  const ts = avlDoc?.timestamp ? new Date(avlDoc.timestamp).getTime() : NaN;
  if (!Number.isFinite(ts)) return finalizeState(state);

  if (state.cursor.processedTs != null && ts <= new Date(state.cursor.processedTs).getTime()) {
    return finalizeState(state);
  }

  const fromMs = from ? new Date(from).getTime() : ts;
  const toMs = to ? new Date(to).getTime() : ts;
  const hourly = hourlyMapFromArray(state.hourlyBuckets);

  if (raw.length === 0) {
    // Invalid GPS — still mark processed so the same record is not retried
    state.cursor.processedTs = new Date(ts);
    state.hourlyBuckets = hourlyArrayFromMap(hourly);
    return finalizeState(state);
  }

  const curr = raw[0];
  const prev = lastValidFromCursor(state.cursor);
  applyValidPoint(state, hourly, prev, curr, { fromMs, toMs });

  state.cursor.processedTs = new Date(curr.ts);
  state.cursor.ts = new Date(curr.ts);
  state.cursor.lat = curr.lat;
  state.cursor.lon = curr.lon;
  state.cursor.speed = curr.speed;
  state.cursor.ignition = curr.ignition === true;
  state.cursor.movement = curr.movement === true;
  state.cursor.moving = curr.moving === true;
  state.hourlyBuckets = hourlyArrayFromMap(hourly);
  return finalizeState(state);
}

function replayDailyMetrics(avlDocs, { from, to } = {}) {
  let state = emptyDayState();
  const list = avlDocs || [];
  const fromDate = from || (list[0]?.timestamp ? new Date(list[0].timestamp) : new Date());
  const toDate = to || new Date();
  for (const doc of list) {
    state = applyIncrementalPoint(state, doc, { from: fromDate, to: toDate });
  }
  return state;
}

function stateFromPersisted(doc) {
  if (!doc) return emptyDayState();
  const base = emptyDayState();
  return {
    ...base,
    engineOnMs: doc.engineOnMs || 0,
    engineOffMs: doc.engineOffMs || 0,
    movingMs: doc.movingMs || 0,
    idleMs: doc.idleMs || 0,
    parkedMs: doc.parkedMs || 0,
    distanceKm: doc.distanceKm || 0,
    distanceSource: doc.distanceSource || 'none',
    odometerEndKm: doc.odometerEndKm ?? null,
    avgSpeedKmh: doc.avgSpeedKmh || 0,
    maxSpeedKmh: doc.maxSpeedKmh || 0,
    tripCount: doc.tripCount || 0,
    stopCount: doc.stopCount || 0,
    longestDriveMs: doc.longestDriveMs || 0,
    longestIdleMs: doc.longestIdleMs || 0,
    pointCount: doc.pointCount || 0,
    gpsGapMs: doc.gpsGapMs || 0,
    firstFixAt: doc.firstFixAt || null,
    lastFixAt: doc.lastFixAt || null,
    activeDays: doc.activeDays != null ? doc.activeDays : doc.pointCount > 0 ? 1 : 0,
    engineVersion: doc.engineVersion || ENGINE_VERSION,
    hourlyBuckets: (doc.hourlyBuckets || []).map((b) => ({ ...b })),
    cursor: { ...emptyCursor(), ...(doc.cursor || {}) },
  };
}

module.exports = {
  emptyDayState,
  applyIncrementalPoint,
  replayDailyMetrics,
  stateFromPersisted,
  finalizeState,
};
