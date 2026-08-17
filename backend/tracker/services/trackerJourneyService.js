const deviceRepository = require('../repositories/deviceRepository');
const avlRecordRepository = require('../repositories/avlRecordRepository');
const { mapAvlRecord } = require('../mappers/avlMapper');
const { notFound } = require('../utils/apiResponse');
const { parseRequiredRange } = require('../utils/timeRange');
const { calculateDistanceMeters, isValidCoordinates } = require('../utils/geo');
const { simplifyPath } = require('../utils/pathSimplify');
const { MOVING_SPEED_KMH } = require('../constants/trackerStatus');

const STOP_MIN_MS = 3 * 60 * 1000; // 3 minutes
const STOP_CLUSTER_M = 50;
const TRIP_MIN_MS = 2 * 60 * 1000;
const TRIP_MIN_M = 200;
const GPS_GAP_MS = 15 * 60 * 1000;

function isMovingPoint(mapped) {
  const speed = Number(mapped?.speed) || 0;
  return speed >= MOVING_SPEED_KMH || mapped?.movement === true;
}

function gnssLabel(value) {
  if (value === 0) return 'GPS Off';
  if (value === 1) return 'GPS Locked';
  if (value === 2) return 'Searching…';
  if (value === 3) return 'GPS Sleep';
  if (value === 4) return 'GPS Locked';
  return null;
}

/**
 * Build chronological raw points with valid GPS.
 */
function buildRawPoints(docs) {
  const out = [];
  for (const doc of docs) {
    const mapped = mapAvlRecord(doc);
    if (!mapped) continue;
    if (!isValidCoordinates(mapped.latitude, mapped.longitude)) continue;
    const ts = mapped.timestamp ? new Date(mapped.timestamp).getTime() : NaN;
    if (!Number.isFinite(ts)) continue;
    out.push({
      t: new Date(ts).toISOString(),
      ts,
      lat: Number(mapped.latitude),
      lon: Number(mapped.longitude),
      speed: Number(mapped.speed) || 0,
      heading: mapped.heading ?? null,
      ignition: mapped.ignition === true,
      movement: mapped.movement === true,
      moving: isMovingPoint(mapped),
      batteryVoltage: mapped.batteryVoltage,
      externalVoltage: mapped.externalVoltage,
      totalOdometer: mapped.totalOdometer,
      gnssStatus: mapped.gnssStatus,
    });
  }
  return out;
}

/**
 * Detect idle/parked stops (≥3 min non-moving, clustered ≤50m).
 */
function detectStops(raw) {
  const stops = [];
  if (raw.length === 0) return stops;

  let i = 0;
  let stopSeq = 0;
  while (i < raw.length) {
    if (raw[i].moving) {
      i += 1;
      continue;
    }

    const start = i;
    let sumLat = raw[i].lat;
    let sumLon = raw[i].lon;
    let count = 1;
    let ignitionOnCount = raw[i].ignition ? 1 : 0;
    let j = i + 1;

    while (j < raw.length && !raw[j].moving) {
      const centerLat = sumLat / count;
      const centerLon = sumLon / count;
      const d = calculateDistanceMeters(centerLat, centerLon, raw[j].lat, raw[j].lon);
      if (d > STOP_CLUSTER_M) break;
      sumLat += raw[j].lat;
      sumLon += raw[j].lon;
      count += 1;
      if (raw[j].ignition) ignitionOnCount += 1;
      j += 1;
    }

    const arrivedAt = raw[start].ts;
    const departedAt = raw[j - 1].ts;
    const durationMs = Math.max(0, departedAt - arrivedAt);

    if (durationMs >= STOP_MIN_MS) {
      const kind = ignitionOnCount / count >= 0.5 ? 'idle' : 'parked';
      stopSeq += 1;
      stops.push({
        id: `stop-${stopSeq}`,
        kind,
        arrivedAt: new Date(arrivedAt).toISOString(),
        departedAt: new Date(departedAt).toISOString(),
        durationMs,
        lat: sumLat / count,
        lon: sumLon / count,
        rawIndexFrom: start,
        rawIndexTo: j - 1,
      });
    }

    i = Math.max(j, i + 1);
  }

  return stops;
}

function computeDistance(raw) {
  let haversineM = 0;
  for (let i = 1; i < raw.length; i += 1) {
    haversineM += calculateDistanceMeters(
      raw[i - 1].lat,
      raw[i - 1].lon,
      raw[i].lat,
      raw[i].lon
    );
  }

  const firstOdo = raw.find((p) => p.totalOdometer != null)?.totalOdometer;
  const lastOdo = [...raw].reverse().find((p) => p.totalOdometer != null)?.totalOdometer;
  let odometerM = null;
  if (firstOdo != null && lastOdo != null && lastOdo >= firstOdo) {
    // Teltonika total odometer is often in meters already; if values look like km (< 1e6 and delta small), still treat as meters when delta is large
    const delta = lastOdo - firstOdo;
    odometerM = delta;
  }

  if (odometerM != null && odometerM > 0 && Number.isFinite(odometerM)) {
    return { distanceM: odometerM, distanceSource: 'odometer' };
  }
  return { distanceM: haversineM, distanceSource: 'haversine' };
}

function computeDurations(raw, stops) {
  let drivingMs = 0;
  for (let i = 1; i < raw.length; i += 1) {
    if (raw[i - 1].moving) {
      drivingMs += Math.max(0, raw[i].ts - raw[i - 1].ts);
    }
  }

  let idleMs = 0;
  let parkedMs = 0;
  for (const s of stops) {
    if (s.kind === 'idle') idleMs += s.durationMs;
    else parkedMs += s.durationMs;
  }

  let maxSpeed = 0;
  for (const p of raw) {
    if (p.speed > maxSpeed) maxSpeed = p.speed;
  }

  // Trip count: moving segments meeting min thresholds
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
  if (segStart != null) {
    const dur = raw[raw.length - 1].ts - segStart;
    if (dur >= TRIP_MIN_MS || segDist >= TRIP_MIN_M) tripCount += 1;
  }

  return {
    drivingMs,
    idleMs,
    parkedMs,
    maxSpeed,
    tripCount,
  };
}

function buildTimelineAndEvents(raw, stops) {
  const timeline = [];
  const events = [];
  let seq = 0;
  const nextId = (prefix) => {
    seq += 1;
    return `${prefix}-${seq}`;
  };

  const pushBoth = (item, includeInTimeline = true) => {
    events.push(item);
    if (includeInTimeline) timeline.push(item);
  };

  // Ignition edges
  for (let i = 1; i < raw.length; i += 1) {
    if (raw[i].ignition !== raw[i - 1].ignition) {
      const on = raw[i].ignition;
      const item = {
        id: nextId('ign'),
        category: 'ignition',
        type: on ? 'ignition_on' : 'ignition_off',
        timestamp: raw[i].t,
        title: on ? 'Ignition ON' : 'Ignition OFF',
        summary: on ? 'Engine / ignition turned on' : 'Engine / ignition turned off',
        severity: 'info',
        refs: { pathIndex: null },
        lat: raw[i].lat,
        lon: raw[i].lon,
        _rawIndex: i,
      };
      pushBoth(item);
    }
  }

  // Movement start/stop edges
  for (let i = 1; i < raw.length; i += 1) {
    if (raw[i].moving && !raw[i - 1].moving) {
      pushBoth({
        id: nextId('mov'),
        category: 'driving',
        type: 'movement_started',
        timestamp: raw[i].t,
        title: 'Started moving',
        summary: `Speed ${Math.round(raw[i].speed)} km/h`,
        severity: 'info',
        refs: {},
        lat: raw[i].lat,
        lon: raw[i].lon,
        _rawIndex: i,
      });
    } else if (!raw[i].moving && raw[i - 1].moving) {
      pushBoth({
        id: nextId('mov'),
        category: 'driving',
        type: 'movement_stopped',
        timestamp: raw[i].t,
        title: 'Stopped',
        summary: 'Vehicle stopped',
        severity: 'info',
        refs: {},
        lat: raw[i].lat,
        lon: raw[i].lon,
        _rawIndex: i,
      });
    }
  }

  // GPS gaps
  for (let i = 1; i < raw.length; i += 1) {
    const gap = raw[i].ts - raw[i - 1].ts;
    if (gap >= GPS_GAP_MS) {
      pushBoth({
        id: nextId('gps'),
        category: 'gps',
        type: 'gps_gap',
        timestamp: raw[i - 1].t,
        endTimestamp: raw[i].t,
        title: 'GPS gap',
        summary: `No points for ${Math.round(gap / 60000)} min`,
        severity: 'warning',
        refs: {},
        lat: raw[i - 1].lat,
        lon: raw[i - 1].lon,
        _rawIndex: i - 1,
      });
    }
  }

  // Stops as timeline story items
  for (const stop of stops) {
    const title = stop.kind === 'idle' ? 'Idle' : 'Parked';
    const mins = Math.round(stop.durationMs / 60000);
    timeline.push({
      id: nextId('stop'),
      category: 'stop',
      type: stop.kind === 'idle' ? 'stop_idle' : 'stop_parked',
      timestamp: stop.arrivedAt,
      endTimestamp: stop.departedAt,
      title,
      summary: `${mins} min`,
      severity: 'info',
      refs: { stopId: stop.id },
      lat: stop.lat,
      lon: stop.lon,
      _rawIndex: stop.rawIndexFrom,
    });
  }

  // Sort by time
  const byTime = (a, b) => new Date(a.timestamp) - new Date(b.timestamp);
  timeline.sort(byTime);
  events.sort(byTime);

  return { timeline, events };
}

function attachPathIndexes(items, path, raw) {
  // Map raw index → nearest path index via _srcIndex
  const rawToPath = new Map();
  path.forEach((p, pathIdx) => {
    if (p._srcIndex != null) rawToPath.set(p._srcIndex, pathIdx);
  });

  function nearestPathIndex(rawIndex) {
    if (rawToPath.has(rawIndex)) return rawToPath.get(rawIndex);
    let best = 0;
    let bestDist = Infinity;
    for (const [ri, pi] of rawToPath) {
      const d = Math.abs(ri - rawIndex);
      if (d < bestDist) {
        bestDist = d;
        best = pi;
      }
    }
    return best;
  }

  return items.map((item) => {
    const { _rawIndex, ...rest } = item;
    const refs = { ...(rest.refs || {}) };
    if (_rawIndex != null) {
      refs.pathIndex = nearestPathIndex(_rawIndex);
    }
    return { ...rest, refs };
  });
}

function mapStopsWithPath(stops, path) {
  const rawToPath = new Map();
  path.forEach((p, pathIdx) => {
    if (p._srcIndex != null) rawToPath.set(p._srcIndex, pathIdx);
  });

  function nearest(rawIndex) {
    if (rawToPath.has(rawIndex)) return rawToPath.get(rawIndex);
    let best = 0;
    let bestDist = Infinity;
    for (const [ri, pi] of rawToPath) {
      const d = Math.abs(ri - rawIndex);
      if (d < bestDist) {
        bestDist = d;
        best = pi;
      }
    }
    return best;
  }

  return stops.map((s) => ({
    id: s.id,
    kind: s.kind,
    arrivedAt: s.arrivedAt,
    departedAt: s.departedAt,
    durationMs: s.durationMs,
    lat: Math.round(s.lat * 1e6) / 1e6,
    lon: Math.round(s.lon * 1e6) / 1e6,
    pathIndex: nearest(s.rawIndexFrom),
    pathIndexFrom: nearest(s.rawIndexFrom),
    pathIndexTo: nearest(s.rawIndexTo),
  }));
}

async function resolveDevice({ role, companyName, deviceId, companyNameFilter }) {
  const device = await deviceRepository.findGpsTrackerByDeviceId({
    role,
    companyName,
    deviceId,
    companyNameFilter,
  });
  if (!device) throw notFound('Device not found');
  return device;
}

/**
 * Journey read-model for Vehicle Detail (path, stops, summary, timeline, events).
 * `trips` reserved (empty) for future Trip Segmentation.
 */
async function getJourney({
  role,
  companyName,
  deviceId,
  companyNameFilter,
  from,
  to,
}) {
  const { from: fromDate, to: toDate } = parseRequiredRange(from, to);
  const device = await resolveDevice({
    role,
    companyName,
    deviceId,
    companyNameFilter,
  });

  const docs = await avlRecordRepository.findHistoryAscForJourney({
    deviceObjectId: device._id,
    from: fromDate,
    to: toDate,
  });

  const raw = buildRawPoints(docs);
  const stops = detectStops(raw);
  const { distanceM, distanceSource } = computeDistance(raw);
  const durations = computeDurations(raw, stops);

  // Force-keep stop enter/exit points in simplification
  const forceIndices = [];
  for (const s of stops) {
    forceIndices.push(s.rawIndexFrom, s.rawIndexTo);
  }

  const simplified = simplifyPath(raw, 25, 1500, forceIndices);
  const path = simplified.map((p) => ({
    t: p.t,
    lat: p.lat,
    lon: p.lon,
    speed: p.speed,
    _srcIndex: p._srcIndex,
  }));

  const { timeline: rawTimeline, events: rawEvents } = buildTimelineAndEvents(raw, stops);
  const timeline = attachPathIndexes(rawTimeline, path, raw);
  const events = attachPathIndexes(rawEvents, path, raw);
  const stopsOut = mapStopsWithPath(stops, path);

  const pathPublic = path.map(({ t, lat, lon, speed }) => ({ t, lat, lon, speed }));

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const p of pathPublic) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }

  const bounds =
    pathPublic.length > 0
      ? { north: maxLat, south: minLat, east: maxLon, west: minLon }
      : null;

  const drivingHours = durations.drivingMs / 3600000;
  const avgSpeed =
    drivingHours > 0 ? Math.round((distanceM / 1000 / drivingHours) * 100) / 100 : 0;

  return {
    deviceId: device.deviceId,
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    summary: {
      distanceM: Math.round(distanceM * 100) / 100,
      distanceKm: Math.round((distanceM / 1000) * 100) / 100,
      distanceSource,
      drivingMs: durations.drivingMs,
      idleMs: durations.idleMs,
      parkedMs: durations.parkedMs,
      avgSpeedKmh: avgSpeed,
      maxSpeedKmh: Math.round(durations.maxSpeed * 100) / 100,
      tripCount: durations.tripCount,
      stopCount: stopsOut.length,
      pointCountRaw: raw.length,
    },
    path: pathPublic,
    stops: stopsOut,
    timeline,
    events,
    trips: [], // ✅ reserved for future Trip Segmentation
    bounds,
    meta: {
      simplification: 'douglas-peucker',
      pointCountRaw: raw.length,
      pointCountPath: pathPublic.length,
      distanceSource,
      gnssNote: gnssLabel(raw[raw.length - 1]?.gnssStatus),
    },
  };
}

module.exports = {
  getJourney,
  // exported for unit tests + incremental day stats
  buildRawPoints,
  detectStops,
  computeDistance,
  STOP_MIN_MS,
  STOP_CLUSTER_M,
  TRIP_MIN_MS,
  TRIP_MIN_M,
  GPS_GAP_MS,
};
