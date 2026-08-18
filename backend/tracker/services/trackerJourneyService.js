const deviceRepository = require('../repositories/deviceRepository');
const avlRecordRepository = require('../repositories/avlRecordRepository');
const TrackerStat = require('../../models/TrackerStat');
const { mapAvlRecord } = require('../mappers/avlMapper');
const { notFound } = require('../utils/apiResponse');
const { parseRequiredRange } = require('../utils/timeRange');
const { calculateDistanceMeters, isValidCoordinates } = require('../utils/geo');
const { simplifyPath } = require('../utils/pathSimplify');
const { MOVING_SPEED_KMH } = require('../constants/trackerStatus');
const { istDayKey, istDayStart } = require('../analytics/dateHelpers');

const STOP_MIN_MS = 3 * 60 * 1000; // 3 minutes
const STOP_CLUSTER_M = 50;
const TRIP_MIN_MS = 2 * 60 * 1000;
const TRIP_MIN_M = 200;
const GPS_GAP_MS = 15 * 60 * 1000;
const MS_HOUR = 3600000;
// ✅ Map payload cap — enough for a route, cheap to send
const PATH_MAX_POINTS = 500;
const PATH_TOLERANCE_M = 40;
const PATH_SAMPLE_MAX_DOCS = 4000;
const JOURNEY_CACHE_TTL_MS = 45000;
const JOURNEY_CACHE_MAX = 20;

/** Short-lived raw-point cache so timeline can reuse the path Mongo read. */
const journeyRawCache = new Map();

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

function parseInclude(include) {
  if (!include || include === 'all') {
    return { path: true, stops: true, timeline: true, summary: true };
  }
  const set = new Set(
    String(include)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  return {
    path: set.has('path'),
    stops: set.has('stops'),
    timeline: set.has('timeline'),
    summary: set.has('summary'),
  };
}

function parseAfter(after) {
  if (!after) return null;
  const d = new Date(after);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Evenly thin a long AVL list so 7-day maps stay cheap. */
function strideSampleDocs(docs, max = PATH_SAMPLE_MAX_DOCS) {
  if (!docs || docs.length <= max) return docs;
  const step = Math.ceil(docs.length / max);
  const out = [];
  for (let i = 0; i < docs.length; i += step) out.push(docs[i]);
  const last = docs[docs.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function boundsOf(pathPublic) {
  if (!pathPublic || pathPublic.length === 0) return null;
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
  return { north: maxLat, south: minLat, east: maxLon, west: minLon };
}

function journeyCacheKey(deviceObjectId, fromDate, toDate) {
  return `${deviceObjectId}|${fromDate.toISOString()}|${istDayKey(toDate)}`;
}

function rememberJourneyRaw(key, value) {
  if (journeyRawCache.size >= JOURNEY_CACHE_MAX) {
    const first = journeyRawCache.keys().next().value;
    journeyRawCache.delete(first);
  }
  journeyRawCache.set(key, { ...value, at: Date.now() });
}

function getCachedJourneyRaw(key) {
  const entry = journeyRawCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > JOURNEY_CACHE_TTL_MS) {
    journeyRawCache.delete(key);
    return null;
  }
  return entry;
}

function mapTotalsToTripSummary(totals, extra = {}) {
  const drivingMs = Number(totals.movingMs || totals.drivingMs) || 0;
  const distanceKm = Number(totals.distanceKm) || 0;
  const drivingHours = drivingMs / MS_HOUR;
  const avgFromTotals = Number(totals.avgSpeedKmh);
  const avgSpeedKmh = Number.isFinite(avgFromTotals) && avgFromTotals > 0
    ? Math.round(avgFromTotals * 100) / 100
    : drivingHours > 0
      ? Math.round((distanceKm / drivingHours) * 100) / 100
      : 0;
  return {
    drivingMs,
    idleMs: Number(totals.idleMs) || 0,
    parkedMs: Number(totals.parkedMs) || 0,
    distanceM: Math.round(distanceKm * 1000 * 100) / 100,
    distanceKm: Math.round(distanceKm * 100) / 100,
    distanceSource: totals.distanceSource && totals.distanceSource !== 'none'
      ? totals.distanceSource
      : extra.distanceSource || totals.distanceSource || null,
    avgSpeedKmh,
    maxSpeedKmh: Math.round((Number(totals.maxSpeedKmh) || 0) * 100) / 100,
    tripCount: totals.tripCount == null ? null : Number(totals.tripCount) || 0,
    stopCount: totals.stopCount == null ? null : Number(totals.stopCount) || 0,
    pointCountRaw: Number(totals.pointCount) || 0,
    source: extra.source || 'trackerstat',
  };
}

function sumStatDocs(docs) {
  const totals = {
    movingMs: 0,
    idleMs: 0,
    parkedMs: 0,
    distanceKm: 0,
    tripCount: 0,
    stopCount: 0,
    pointCount: 0,
    maxSpeedKmh: 0,
    distanceSource: 'none',
    avgSpeedKmh: 0,
  };
  const sources = new Set();
  for (const d of docs || []) {
    totals.movingMs += d.movingMs || 0;
    totals.idleMs += d.idleMs || 0;
    totals.parkedMs += d.parkedMs || 0;
    totals.distanceKm += d.distanceKm || 0;
    totals.tripCount += d.tripCount || 0;
    totals.stopCount += d.stopCount || 0;
    totals.pointCount += d.pointCount || 0;
    totals.maxSpeedKmh = Math.max(totals.maxSpeedKmh, d.maxSpeedKmh || 0);
    if (d.distanceSource && d.distanceSource !== 'none') sources.add(d.distanceSource);
  }
  if (sources.size === 1) totals.distanceSource = [...sources][0];
  else if (sources.size > 1) totals.distanceSource = 'mixed';
  const hours = totals.movingMs / MS_HOUR;
  totals.avgSpeedKmh = hours > 0 ? Math.round((totals.distanceKm / hours) * 100) / 100 : 0;
  return totals;
}

function sumHourlyBuckets(buckets, fromDate, toDate) {
  const fromMs = fromDate.getTime();
  const toMs = toDate.getTime();
  const overlapping = (buckets || []).filter((h) => {
    const start = new Date(h.periodStart).getTime();
    if (!Number.isFinite(start)) return false;
    const end = start + MS_HOUR;
    return start < toMs && end > fromMs;
  });
  return sumStatDocs(overlapping);
}

function emptyTripSummary() {
  return mapTotalsToTripSummary({}, { source: 'none' });
}

/**
 * Fast trip cards — TrackerStat / hourly buckets, no AVL scan.
 */
async function getTripSummary({
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

  const fromKey = istDayKey(fromDate);
  const toKey = istDayKey(toDate);
  const dayDocs = await TrackerStat.find({
    device: device._id,
    granularity: 'day',
    periodKey: { $gte: fromKey, $lte: toKey },
  })
    .sort({ periodStart: 1 })
    .lean();

  if (!dayDocs.length) {
    return {
      deviceId: device.deviceId,
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      ...emptyTripSummary(),
    };
  }

  const sameDay = fromKey === toKey;
  const rangeMs = toDate.getTime() - fromDate.getTime();
  const fromIsMidnight =
    Math.abs(fromDate.getTime() - istDayStart(fromDate).getTime()) < 2 * 60 * 1000;

  let totals;
  let source = 'trackerstat';

  // Today (midnight → now) uses the day doc. 1h/3h uses hourly buckets.
  if (sameDay && fromIsMidnight) {
    totals = sumStatDocs(dayDocs);
  } else if (sameDay && dayDocs[0]?.hourlyBuckets?.length) {
    totals = {
      ...sumHourlyBuckets(dayDocs[0].hourlyBuckets, fromDate, toDate),
      maxSpeedKmh: dayDocs[0].maxSpeedKmh || 0,
      tripCount: dayDocs[0].tripCount,
      stopCount: dayDocs[0].stopCount,
      distanceSource: dayDocs[0].distanceSource,
    };
    source = 'hourly';
  } else if (!sameDay && rangeMs < 36 * MS_HOUR) {
    const hourly = dayDocs.flatMap((d) => d.hourlyBuckets || []);
    if (hourly.length) {
      totals = {
        ...sumHourlyBuckets(hourly, fromDate, toDate),
        maxSpeedKmh: Math.max(...dayDocs.map((d) => d.maxSpeedKmh || 0)),
        tripCount: dayDocs.reduce((s, d) => s + (d.tripCount || 0), 0),
        stopCount: dayDocs.reduce((s, d) => s + (d.stopCount || 0), 0),
      };
      source = 'hourly';
    } else {
      totals = sumStatDocs(dayDocs);
    }
  } else {
    totals = sumStatDocs(dayDocs);
  }

  return {
    deviceId: device.deviceId,
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    ...mapTotalsToTripSummary(totals, { source }),
  };
}

function assembleFromRaw(raw, wants, { skipSimplify = false } = {}) {
  const stops = wants.stops || wants.timeline || wants.summary ? detectStops(raw) : [];
  const forceIndices = [];
  for (const s of stops) {
    forceIndices.push(s.rawIndexFrom, s.rawIndexTo);
  }

  let path = [];
  if (wants.path || wants.stops || wants.timeline) {
    if (skipSimplify || raw.length <= 40) {
      path = raw.map((p, i) => ({
        t: p.t,
        lat: p.lat,
        lon: p.lon,
        speed: p.speed,
        _srcIndex: i,
      }));
    } else {
      const simplified = simplifyPath(raw, PATH_TOLERANCE_M, PATH_MAX_POINTS, forceIndices);
      path = simplified.map((p) => ({
        t: p.t,
        lat: p.lat,
        lon: p.lon,
        speed: p.speed,
        _srcIndex: p._srcIndex,
      }));
    }
  }

  const pathPublic = path.map(({ t, lat, lon, speed }) => ({ t, lat, lon, speed }));
  const stopsOut = wants.stops || wants.timeline ? mapStopsWithPath(stops, path) : [];

  let timeline = [];
  let events = [];
  if (wants.timeline) {
    const built = buildTimelineAndEvents(raw, stops);
    timeline = attachPathIndexes(built.timeline, path, raw);
    events = attachPathIndexes(built.events, path, raw);
  }

  let summary = null;
  if (wants.summary) {
    const { distanceM, distanceSource } = computeDistance(raw);
    const durations = computeDurations(raw, stops);
    const drivingHours = durations.drivingMs / MS_HOUR;
    const avgSpeed =
      drivingHours > 0 ? Math.round((distanceM / 1000 / drivingHours) * 100) / 100 : 0;
    summary = {
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
      source: 'avl',
    };
  }

  return {
    path: pathPublic,
    stops: stopsOut,
    timeline,
    events,
    summary,
    bounds: boundsOf(pathPublic),
    pathInternal: path,
    stopsInternal: stops,
  };
}

/**
 * Journey read-model for Vehicle Detail (path, stops, optional timeline).
 * `trips` reserved (empty) for future Trip Segmentation.
 */
async function getJourney({
  role,
  companyName,
  deviceId,
  companyNameFilter,
  from,
  to,
  after,
  include,
}) {
  const { from: fromDate, to: toDate } = parseRequiredRange(from, to);
  const device = await resolveDevice({
    role,
    companyName,
    deviceId,
    companyNameFilter,
  });
  const wants = parseInclude(include);
  const afterDate = parseAfter(after);
  const cacheKey = journeyCacheKey(device._id, fromDate, toDate);
  const incremental = Boolean(afterDate);

  // Incremental 60s refresh: only new pings, no timeline rebuild
  if (incremental) {
    const docs = await avlRecordRepository.findHistoryAscForJourney({
      deviceObjectId: device._id,
      from: fromDate,
      to: toDate,
      after: afterDate,
      mode: 'path',
    });
    const raw = buildRawPoints(docs);
    const assembled = assembleFromRaw(raw, { path: true, stops: false, timeline: false, summary: false }, {
      skipSimplify: true,
    });
    return {
      deviceId: device.deviceId,
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      incremental: true,
      after: afterDate.toISOString(),
      summary: null,
      path: assembled.path,
      stops: [],
      timeline: [],
      events: [],
      trips: [],
      bounds: assembled.bounds,
      meta: {
        simplification: 'none',
        pointCountRaw: raw.length,
        pointCountPath: assembled.path.length,
        incremental: true,
      },
    };
  }

  // Timeline-only: reuse the path Mongo read when still warm
  let raw = null;
  let cachedPath = null;
  if (wants.timeline && !wants.path) {
    const cached = getCachedJourneyRaw(cacheKey);
    if (cached?.raw) {
      raw = cached.raw;
      cachedPath = cached.pathInternal || null;
    }
  }

  if (!raw) {
    const docs = strideSampleDocs(
      await avlRecordRepository.findHistoryAscForJourney({
        deviceObjectId: device._id,
        from: fromDate,
        to: toDate,
        mode: 'path',
      })
    );
    raw = buildRawPoints(docs);
  }

  const assembled = assembleFromRaw(raw, { ...wants, summary: true });
  if (wants.path || wants.stops) {
    rememberJourneyRaw(cacheKey, { raw, pathInternal: assembled.pathInternal });
  }

  let timeline = assembled.timeline;
  let events = assembled.events;
  if (wants.timeline && cachedPath && cachedPath.length && !wants.path) {
    const stops = detectStops(raw);
    const built = buildTimelineAndEvents(raw, stops);
    timeline = attachPathIndexes(built.timeline, cachedPath, raw);
    events = attachPathIndexes(built.events, cachedPath, raw);
  }

  return {
    deviceId: device.deviceId,
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    incremental: false,
    summary: assembled.summary,
    path: wants.path ? assembled.path : [],
    stops: wants.stops ? assembled.stops : [],
    timeline,
    events,
    trips: [], // ✅ reserved for future Trip Segmentation
    bounds: wants.path ? assembled.bounds : null,
    meta: {
      simplification: 'douglas-peucker',
      pointCountRaw: raw.length,
      pointCountPath: assembled.path.length,
      distanceSource: assembled.summary?.distanceSource,
      gnssNote: gnssLabel(raw[raw.length - 1]?.gnssStatus),
    },
  };
}

module.exports = {
  getJourney,
  getTripSummary,
  // exported for unit tests + incremental day stats
  buildRawPoints,
  detectStops,
  computeDistance,
  parseInclude,
  strideSampleDocs,
  mapTotalsToTripSummary,
  STOP_MIN_MS,
  STOP_CLUSTER_M,
  TRIP_MIN_MS,
  TRIP_MIN_M,
  GPS_GAP_MS,
};
