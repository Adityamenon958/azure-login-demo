const TrackerStat = require('../../models/TrackerStat');
const Device = require('../../models/Device');
const deviceRepository = require('../repositories/deviceRepository');
const avlRecordRepository = require('../repositories/avlRecordRepository');
const { badRequest, notFound } = require('../utils/apiResponse');
const { computeDailyMetrics, computeHourlyMetrics } = require('./metricsEngine');
const { computeDueItems, hasMaintenanceDue } = require('./maintenance');
const cache = require('./analyticsCache');
const {
  resolveGranularity,
  istDayKey,
  istDayStart,
  istDayEndExclusive,
  istHourStart,
  istHourKey,
  isSameIstDay,
} = require('./dateHelpers');
const { OFFLINE_AFTER_MS } = require('../constants/trackerStatus');

const MS_HOUR = 3600000;
const MAX_RANGE_MS = 5 * 365 * 86400000;

function parseRange(from, to) {
  if (!from || !to) throw badRequest('from and to are required (ISO dates)');
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw badRequest('Invalid from/to date');
  }
  if (toDate < fromDate) throw badRequest('to must be >= from');
  if (toDate - fromDate > MAX_RANGE_MS) {
    throw badRequest('Range too large (max ~5 years)');
  }
  return { fromDate, toDate };
}

function daysInRange(fromDate, toDate) {
  return Math.max(1, Math.ceil((toDate - fromDate) / 86400000));
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Health score 0–100 + status band.
 */
function computeHealthScore({
  utilizationPct,
  offlineDays,
  gpsGapRatio,
  maintenanceDue,
  idleRatio,
}) {
  let score = 100;
  if (offlineDays >= 30) score -= 40;
  else if (offlineDays >= 7) score -= 25;
  else if (offlineDays >= 3) score -= 12;
  else if (offlineDays >= 1) score -= 5;

  if (gpsGapRatio > 0.4) score -= 15;
  else if (gpsGapRatio > 0.2) score -= 8;

  if (maintenanceDue) score -= 20;

  if (idleRatio > 0.7) score -= 10;
  else if (idleRatio > 0.5) score -= 5;

  if (utilizationPct != null) {
    if (utilizationPct < 20) score -= 10;
    else if (utilizationPct > 95) score -= 5;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  let status = 'healthy';
  if (score < 50) status = 'critical';
  else if (score < 75) status = 'attention';
  return { healthScore: score, healthStatus: status };
}

function computeFleetScore({
  fleetUtilizationPct,
  onlinePct,
  maintenanceCompliantPct,
  avgHealthScore,
  gpsQualityPct,
}) {
  const score =
    (fleetUtilizationPct ?? 0) * 0.25 +
    (onlinePct ?? 0) * 0.25 +
    (maintenanceCompliantPct ?? 100) * 0.2 +
    (avgHealthScore ?? 70) * 0.2 +
    (gpsQualityPct ?? 80) * 0.1;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function offlineBucket(lastFixAt, now = new Date()) {
  if (!lastFixAt) return 'offline30plus';
  const age = now.getTime() - new Date(lastFixAt).getTime();
  if (age < OFFLINE_AFTER_MS) return 'online';
  if (age < 86400000) return 'offline1d';
  if (age < 3 * 86400000) return 'offline3d';
  if (age < 7 * 86400000) return 'offline7d';
  return 'offline30plus';
}

function offlineDays(lastFixAt, now = new Date()) {
  if (!lastFixAt) return 999;
  return Math.floor((now.getTime() - new Date(lastFixAt).getTime()) / 86400000);
}

async function loadDevices(scope) {
  return deviceRepository.findGpsTrackers(scope);
}

async function loadLatestByDevice(devices) {
  const ids = devices.map((d) => d._id);
  const latest = await avlRecordRepository.findLatestByDeviceIds(ids);
  const map = new Map();
  for (const doc of latest) {
    map.set(String(doc.device), doc);
  }
  return map;
}

/**
 * Query rollup docs for company devices in range at chosen granularity.
 */
async function fetchRollups({ devices, fromDate, toDate, granularity }) {
  const ids = devices.map((d) => d._id);
  if (ids.length === 0) return [];
  return TrackerStat.find({
    device: { $in: ids },
    granularity,
    periodStart: { $gte: fromDate, $lte: toDate },
  }).lean();
}

/**
 * Live "today" partial for devices (IST day) — merged into day-granularity queries.
 * ✅ Parallel batches — sequential scans made export hang on larger fleets.
 * Also attaches `_hourly` for Today fleet-trends (in-memory, not persisted).
 */
async function computeTodayPartials(devices, { concurrency = 8 } = {}) {
  const todayKey = istDayKey(new Date());
  const from = istDayStart(todayKey);
  const to = istDayEndExclusive(todayKey);
  const end = new Date(Math.min(Date.now(), to.getTime() - 1));
  const out = [];
  const list = devices || [];
  const limit = Math.max(1, Math.min(20, concurrency));

  for (let i = 0; i < list.length; i += limit) {
    const chunk = list.slice(i, i + limit);
    const partials = await Promise.all(
      chunk.map(async (device) => {
        const docs = await avlRecordRepository.findHistoryAscForJourney({
          deviceObjectId: device._id,
          from,
          to: end,
        });
        if (!docs.length) return null;
        const m = computeDailyMetrics(docs);
        return {
          device: device._id,
          deviceId: device.deviceId,
          companyName: device.companyName,
          granularity: 'day',
          periodKey: todayKey,
          periodStart: from,
          ...m,
          activeDays: m.pointCount > 0 ? 1 : 0,
          _isTodayPartial: true,
          _hourly: computeHourlyMetrics(docs, { from, to: end }),
        };
      })
    );
    for (const p of partials) {
      if (p) out.push(p);
    }
  }
  return out;
}

function groupByDevice(rollups) {
  const map = new Map();
  for (const r of rollups) {
    const key = String(r.device);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  return map;
}

function sumVehicleRollups(list) {
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
  let odometerEndKm = null;
  let lastFixAt = null;

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
    if (d.odometerEndKm != null) {
      if (odometerEndKm == null || d.odometerEndKm > odometerEndKm) {
        odometerEndKm = d.odometerEndKm;
      }
    }
    if (d.lastFixAt) {
      const t = new Date(d.lastFixAt);
      if (!lastFixAt || t > lastFixAt) lastFixAt = t;
    }
  }

  const movingHours = movingMs / MS_HOUR;
  return {
    engineOnMs,
    engineOffMs,
    movingMs,
    idleMs,
    parkedMs,
    distanceKm: round2(distanceKm),
    tripCount,
    stopCount,
    longestDriveMs,
    longestIdleMs,
    pointCount,
    gpsGapMs,
    maxSpeedKmh: round2(maxSpeedKmh),
    avgSpeedKmh: movingHours > 0 ? round2(distanceKm / movingHours) : 0,
    activeDays: Math.max(activeDays, list.length ? 1 : 0),
    odometerEndKm,
    lastFixAt,
  };
}

function buildVehicleRow(device, totals, latestDoc, rangeDays, now = new Date()) {
  const expected = Number(device.expectedDailyHours) || 10;
  const denomHours = expected * Math.max(totals.activeDays || 1, 1);
  const utilizationPct =
    denomHours > 0
      ? round1(((totals.engineOnMs || 0) / MS_HOUR / denomHours) * 100)
      : 0;

  const lastFix =
    latestDoc?.timestamp || totals.lastFixAt || null;
  const offDays = offlineDays(lastFix, now);
  const bucket = offlineBucket(lastFix, now);

  const totalWindowMs =
    (totals.engineOnMs || 0) +
    (totals.engineOffMs || 0) +
    (totals.movingMs || 0);
  const idleRatio =
    totals.idleMs > 0 && totalWindowMs > 0
      ? totals.idleMs / Math.max(totals.engineOnMs + totals.idleMs + totals.parkedMs, 1)
      : totals.idleMs / Math.max(totals.movingMs + totals.idleMs + totals.parkedMs, 1);

  const gpsGapRatio =
    totals.pointCount > 1
      ? Math.min(1, (totals.gpsGapMs || 0) / Math.max(rangeDays * 86400000, 1))
      : offDays > 0
        ? 0.5
        : 0;

  const dueItems = computeDueItems(device, {
    odometerEndKm: totals.odometerEndKm,
    now,
  });
  const maintenanceDue = dueItems.some((i) => i.severity === 'due');
  const maintenanceSoon = dueItems.some((i) => i.severity === 'soon');

  const { healthScore, healthStatus } = computeHealthScore({
    utilizationPct,
    offlineDays: offDays,
    gpsGapRatio,
    maintenanceDue,
    idleRatio: Number.isFinite(idleRatio) ? idleRatio : 0,
  });

  return {
    deviceId: device.deviceId,
    displayName: device.displayName || device.deviceId,
    deviceModel: device.deviceModel || null,
    companyName: device.companyName,
    expectedDailyHours: expected,
    totalEngineMs: device.totalEngineMs || 0,
    engineOnMs: totals.engineOnMs,
    engineOffMs: totals.engineOffMs,
    movingMs: totals.movingMs,
    idleMs: totals.idleMs,
    parkedMs: totals.parkedMs,
    distanceKm: totals.distanceKm,
    tripCount: totals.tripCount,
    stopCount: totals.stopCount,
    avgSpeedKmh: totals.avgSpeedKmh,
    maxSpeedKmh: totals.maxSpeedKmh,
    longestDriveMs: totals.longestDriveMs,
    longestIdleMs: totals.longestIdleMs,
    activeDays: totals.activeDays,
    utilizationPct,
    healthScore,
    healthStatus,
    maintenanceDue,
    maintenanceSoon,
    maintenanceItems: dueItems,
    lastOnline: lastFix ? new Date(lastFix).toISOString() : null,
    offlineBucket: bucket,
    offlineDays: offDays === 999 ? null : offDays,
    daysSinceLastMovement: offDays === 999 ? null : offDays,
  };
}

async function buildAllVehicleRows(scope, fromDate, toDate, options = {}) {
  const { skipTodayPartial = false } = options;
  const devices = await loadDevices(scope);
  const granularity = resolveGranularity(fromDate, toDate);
  let rollups = await fetchRollups({ devices, fromDate, toDate, granularity });

  // Merge today partial when querying day granularity and range includes today
  // ❗ Export skips this — sequential AVL scans per device can hang for minutes
  if (
    !skipTodayPartial &&
    granularity === 'day' &&
    isSameIstDay(toDate, new Date())
  ) {
    const partials = await computeTodayPartials(devices);
    // Replace any existing today day docs with live partial
    const todayKey = istDayKey(new Date());
    rollups = rollups.filter((r) => r.periodKey !== todayKey);
    rollups = rollups.concat(partials);
  }

  const byDevice = groupByDevice(rollups);
  const latestMap = await loadLatestByDevice(devices);
  const rangeDays = daysInRange(fromDate, toDate);
  const now = new Date();

  const rows = devices.map((device) => {
    const list = byDevice.get(String(device._id)) || [];
    const totals = sumVehicleRollups(list);
    return buildVehicleRow(
      device,
      totals,
      latestMap.get(String(device._id)),
      rangeDays,
      now
    );
  });

  return { rows, devices, granularity, rollups };
}

function buildSeries(rollups, granularity) {
  const byPeriod = new Map();
  for (const r of rollups) {
    const key = r.periodKey;
    if (!byPeriod.has(key)) {
      byPeriod.set(key, {
        periodKey: key,
        periodStart: r.periodStart,
        engineOnMs: 0,
        movingMs: 0,
        idleMs: 0,
        parkedMs: 0,
        distanceKm: 0,
      });
    }
    const b = byPeriod.get(key);
    b.engineOnMs += r.engineOnMs || 0;
    b.movingMs += r.movingMs || 0;
    b.idleMs += r.idleMs || 0;
    b.parkedMs += r.parkedMs || 0;
    b.distanceKm += r.distanceKm || 0;
  }
  return [...byPeriod.values()]
    .sort((a, b) => new Date(a.periodStart) - new Date(b.periodStart))
    .map((b) => ({
      ...b,
      distanceKm: round2(b.distanceKm),
      granularity,
    }));
}

function emptyHourBucket(periodStart) {
  return {
    periodKey: istHourKey(periodStart),
    periodStart: new Date(periodStart),
    engineOnMs: 0,
    movingMs: 0,
    idleMs: 0,
    parkedMs: 0,
    distanceKm: 0,
    granularity: 'hour',
  };
}

/** Fleet-wide IST hourly series from midnight → current hour (Today chart). */
function buildHourlyFleetSeries(rollups, fromDate, toDate) {
  const dayStart = istDayStart(fromDate);
  const lastHour = istHourStart(toDate);
  const byKey = new Map();

  for (let t = dayStart.getTime(); t <= lastHour.getTime(); t += MS_HOUR) {
    const bucket = emptyHourBucket(t);
    byKey.set(bucket.periodKey, bucket);
  }

  for (const r of rollups || []) {
    if (!Array.isArray(r._hourly)) continue;
    for (const h of r._hourly) {
      const b = byKey.get(h.periodKey);
      if (!b) continue;
      b.engineOnMs += h.engineOnMs || 0;
      b.movingMs += h.movingMs || 0;
      b.idleMs += h.idleMs || 0;
      b.parkedMs += h.parkedMs || 0;
      b.distanceKm += h.distanceKm || 0;
    }
  }

  return [...byKey.values()].map((b) => ({
    ...b,
    distanceKm: round2(b.distanceKm),
  }));
}

function isTodayIstRange(fromDate, toDate) {
  const now = new Date();
  return isSameIstDay(fromDate, now) && isSameIstDay(toDate, now);
}

async function getSummary(scope, { from, to }) {
  const { fromDate, toDate } = parseRange(from, to);
  const ck = cache.cacheKey([
    'summary',
    scope.role,
    scope.companyName,
    scope.companyNameFilter,
    scope.includeReal !== false ? 'r1' : 'r0',
    scope.includeDemo !== false ? 'd1' : 'd0',
    fromDate.toISOString(),
    toDate.toISOString(),
  ]);
  const cached = cache.get(ck);
  if (cached) return cached;

  const { rows, granularity, rollups } = await buildAllVehicleRows(
    scope,
    fromDate,
    toDate
  );

  const totalVehicles = rows.length;
  const offlineRows = rows.filter((r) => r.offlineBucket !== 'online');
  const onlineCount = totalVehicles - offlineRows.length;
  const maintenanceDueCount = rows.filter((r) => r.maintenanceDue).length;
  const underutilized = rows.filter((r) => r.utilizationPct < 40).length;
  const overworked = rows.filter((r) => r.utilizationPct > 90).length;
  const activeVehicles = rows.filter(
    (r) => (r.engineOnMs || 0) > 0 || (r.movingMs || 0) > 0
  ).length;

  const sumEngineOn = rows.reduce((s, r) => s + (r.engineOnMs || 0), 0);
  const sumMoving = rows.reduce((s, r) => s + (r.movingMs || 0), 0);
  const sumIdle = rows.reduce((s, r) => s + (r.idleMs || 0), 0);
  const sumParked = rows.reduce((s, r) => s + (r.parkedMs || 0), 0);
  const sumDistance = rows.reduce((s, r) => s + (r.distanceKm || 0), 0);
  const sumExpectedHours = rows.reduce(
    (s, r) => s + (r.expectedDailyHours || 10) * Math.max(r.activeDays || 1, 1),
    0
  );

  const fleetUtilizationPct =
    sumExpectedHours > 0
      ? round1((sumEngineOn / MS_HOUR / sumExpectedHours) * 100)
      : 0;

  const avgHealth =
    totalVehicles > 0
      ? round1(rows.reduce((s, r) => s + r.healthScore, 0) / totalVehicles)
      : 0;

  const onlinePct =
    totalVehicles > 0 ? round1((onlineCount / totalVehicles) * 100) : 0;
  const maintenanceCompliantPct =
    totalVehicles > 0
      ? round1(((totalVehicles - maintenanceDueCount) / totalVehicles) * 100)
      : 100;

  const gpsQualityPct = round1(
    Math.max(
      0,
      100 -
        rows.reduce((s, r) => s + Math.min(30, (r.offlineDays || 0) * 2), 0) /
          Math.max(totalVehicles, 1)
    )
  );

  const fleetScore = computeFleetScore({
    fleetUtilizationPct,
    onlinePct,
    maintenanceCompliantPct,
    avgHealthScore: avgHealth,
    gpsQualityPct,
  });

  const buckets = {
    online: rows.filter((r) => r.offlineBucket === 'online').length,
    offline1d: rows.filter((r) => r.offlineBucket === 'offline1d').length,
    offline3d: rows.filter((r) => r.offlineBucket === 'offline3d').length,
    offline7d: rows.filter((r) => r.offlineBucket === 'offline7d').length,
    offline30plus: rows.filter((r) => r.offlineBucket === 'offline30plus').length,
  };

  let longestOffline = null;
  for (const r of offlineRows) {
    if (
      !longestOffline ||
      (r.offlineDays ?? 0) > (longestOffline.offlineDays ?? 0)
    ) {
      longestOffline = {
        deviceId: r.deviceId,
        displayName: r.displayName,
        offlineDays: r.offlineDays,
        lastOnline: r.lastOnline,
      };
    }
  }

  const recentlyOnline = rows
    .filter((r) => r.offlineBucket === 'online' && (r.offlineDays === 0 || r.offlineDays == null))
    .slice(0, 5)
    .map((r) => ({
      deviceId: r.deviceId,
      displayName: r.displayName,
      lastOnline: r.lastOnline,
    }));

  const data = {
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    granularity,
    kpis: {
      fleetScore,
      fleetUtilizationPct,
      totalEngineOnHours: round1(sumEngineOn / MS_HOUR),
      totalMovingHours: round1(sumMoving / MS_HOUR),
      totalIdleHours: round1(sumIdle / MS_HOUR),
      totalParkedHours: round1(sumParked / MS_HOUR),
      totalDistanceKm: round2(sumDistance),
      totalVehicles,
      activeVehicles,
      offlineVehicles: offlineRows.length,
      underutilized,
      overworked,
      maintenanceDue: maintenanceDueCount,
      avgHealthScore: avgHealth,
    },
    offline: {
      buckets,
      longestOffline,
      recentlyOnline,
    },
    series: isTodayIstRange(fromDate, toDate)
      ? buildHourlyFleetSeries(rollups, fromDate, toDate)
      : buildSeries(rollups, granularity),
  };

  cache.set(ck, data, 60000);
  return data;
}

async function getVehicles(scope, query) {
  const { fromDate, toDate } = parseRange(query.from, query.to);
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 25));
  const sort = query.sort || 'utilizationPct';
  const order = query.order === 'asc' ? 1 : -1;
  const search = (query.search || '').trim().toLowerCase();

  const { rows, granularity } = await buildAllVehicleRows(scope, fromDate, toDate);
  let filtered = rows;
  if (search) {
    filtered = rows.filter(
      (r) =>
        (r.deviceId || '').toLowerCase().includes(search) ||
        (r.displayName || '').toLowerCase().includes(search)
    );
  }

  filtered.sort((a, b) => {
    const av = a[sort] ?? 0;
    const bv = b[sort] ?? 0;
    if (typeof av === 'string') return av.localeCompare(bv) * order;
    return (av - bv) * order;
  });

  const total = filtered.length;
  const start = (page - 1) * limit;
  const items = filtered.slice(start, start + limit);

  return {
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    granularity,
    page,
    limit,
    total,
    items,
  };
}

async function getRankings(scope, query) {
  const { fromDate, toDate } = parseRange(query.from, query.to);
  const metric = query.metric || 'engineOnMs';
  const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 10));

  const ck = cache.cacheKey([
    'rankings',
    scope.companyName,
    scope.companyNameFilter,
    scope.includeReal !== false ? 'r1' : 'r0',
    scope.includeDemo !== false ? 'd1' : 'd0',
    fromDate.toISOString(),
    toDate.toISOString(),
    metric,
    limit,
  ]);
  const cached = cache.get(ck);
  if (cached) return cached;

  const { rows, granularity } = await buildAllVehicleRows(scope, fromDate, toDate);
  const sorted = [...rows].sort((a, b) => (b[metric] || 0) - (a[metric] || 0));
  const top = sorted.slice(0, limit).map((r) => ({
    deviceId: r.deviceId,
    displayName: r.displayName,
    value: r[metric],
    utilizationPct: r.utilizationPct,
    healthStatus: r.healthStatus,
  }));
  const bottom = [...sorted]
    .reverse()
    .slice(0, limit)
    .map((r) => ({
      deviceId: r.deviceId,
      displayName: r.displayName,
      value: r[metric],
      utilizationPct: r.utilizationPct,
      healthStatus: r.healthStatus,
    }));

  const offlineSorted = [...rows]
    .filter((r) => r.offlineBucket !== 'online')
    .sort((a, b) => (b.offlineDays || 0) - (a.offlineDays || 0))
    .slice(0, limit)
    .map((r) => ({
      deviceId: r.deviceId,
      displayName: r.displayName,
      offlineDays: r.offlineDays,
      lastOnline: r.lastOnline,
    }));

  const data = {
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    granularity,
    metric,
    top,
    bottom,
    longestOffline: offlineSorted,
  };
  cache.set(ck, data, 60000);
  return data;
}

async function getVehicleDetail(scope, deviceId, { from, to }) {
  const { fromDate, toDate } = parseRange(from, to);
  const device = await deviceRepository.findGpsTrackerByDeviceId({
    ...scope,
    deviceId,
  });
  if (!device) throw notFound('Device not found');

  const granularity = resolveGranularity(fromDate, toDate);
  let rollups = await TrackerStat.find({
    device: device._id,
    granularity,
    periodStart: { $gte: fromDate, $lte: toDate },
  })
    .sort({ periodStart: 1 })
    .lean();

  if (granularity === 'day' && isSameIstDay(toDate, new Date())) {
    const partials = await computeTodayPartials([device]);
    const todayKey = istDayKey(new Date());
    rollups = rollups.filter((r) => r.periodKey !== todayKey).concat(partials);
  }

  const totals = sumVehicleRollups(rollups);
  const latest = await avlRecordRepository.findLatestByDeviceId(device._id);
  const row = buildVehicleRow(
    device,
    totals,
    latest,
    daysInRange(fromDate, toDate)
  );

  // Also include month rollups for drill-down context when available
  const monthly = await TrackerStat.find({
    device: device._id,
    granularity: 'month',
    periodStart: { $gte: fromDate, $lte: toDate },
  })
    .sort({ periodStart: 1 })
    .lean();

  return {
    device: {
      deviceId: device.deviceId,
      displayName: device.displayName || device.deviceId,
      deviceModel: device.deviceModel,
      expectedDailyHours: device.expectedDailyHours || 10,
      totalEngineMs: device.totalEngineMs || 0,
      maintenanceSchedules: device.maintenanceSchedules || [],
    },
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    granularity,
    summary: {
      ...row,
      avgDailyWorkingHours: round1(
        (totals.engineOnMs / MS_HOUR) / Math.max(totals.activeDays || 1, 1)
      ),
      maintenanceRemainingHours:
        row.maintenanceItems.find((i) => i.strategy === 'engineHours')?.remaining ??
        null,
    },
    series: isTodayIstRange(fromDate, toDate)
      ? buildHourlyFleetSeries(rollups, fromDate, toDate)
      : rollups.map((r) => ({
          periodKey: r.periodKey,
          periodStart: r.periodStart,
          engineOnMs: r.engineOnMs,
          movingMs: r.movingMs,
          idleMs: r.idleMs,
          parkedMs: r.parkedMs,
          distanceKm: r.distanceKm,
          granularity,
        })),
    monthly: monthly.map((r) => ({
      periodKey: r.periodKey,
      engineOnMs: r.engineOnMs,
      distanceKm: r.distanceKm,
      tripCount: r.tripCount,
    })),
  };
}

function vehiclesToCsv(items) {
  const headers = [
    'deviceId',
    'displayName',
    'engineOnHours',
    'movingHours',
    'idleHours',
    'parkedHours',
    'distanceKm',
    'trips',
    'utilizationPct',
    'healthScore',
    'healthStatus',
    'maintenanceDue',
    'lastOnline',
    'offlineDays',
  ];
  const lines = [headers.join(',')];
  for (const r of items) {
    const row = [
      r.deviceId,
      JSON.stringify(r.displayName || ''),
      round1((r.engineOnMs || 0) / MS_HOUR),
      round1((r.movingMs || 0) / MS_HOUR),
      round1((r.idleMs || 0) / MS_HOUR),
      round1((r.parkedMs || 0) / MS_HOUR),
      r.distanceKm ?? 0,
      r.tripCount ?? 0,
      r.utilizationPct ?? 0,
      r.healthScore ?? 0,
      r.healthStatus || '',
      r.maintenanceDue ? 'yes' : 'no',
      formatExportTimestamp(r.lastOnline),
      r.offlineDays ?? '',
    ];
    lines.push(row.join(','));
  }
  return lines.join('\n');
}

/** ✅ IST display for export files (matches dashboard locale) */
function formatExportTimestamp(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  } catch {
    return String(iso);
  }
}

async function getExport(scope, query) {
  const format = (query.format || 'csv').toLowerCase();
  const { fromDate, toDate } = parseRange(query.from, query.to);
  const searchRaw = (query.search || '').trim().toLowerCase();
  // ❗ Guard: URLSearchParams can stringify undefined → "undefined"
  const search =
    !searchRaw || searchRaw === 'undefined' || searchRaw === 'null'
      ? ''
      : searchRaw;

  // ✅ Same numbers as Fleet Monitor UI (include today's live partials)
  // Today partials are parallelized so export stays responsive
  const { rows, granularity } = await buildAllVehicleRows(scope, fromDate, toDate, {
    skipTodayPartial: false,
  });

  let items = rows;
  if (search) {
    items = rows.filter(
      (r) =>
        (r.deviceId || '').toLowerCase().includes(search) ||
        (r.displayName || '').toLowerCase().includes(search)
    );
  }

  // Cap oversized fleets so export always finishes
  const MAX_EXPORT = 2000;
  if (items.length > MAX_EXPORT) {
    items = items.slice(0, MAX_EXPORT);
  }

  const from = fromDate.toISOString();
  const to = toDate.toISOString();

  if (format === 'csv') {
    return {
      format: 'csv',
      filename: `fleet-analytics-${from.slice(0, 10)}_${to.slice(0, 10)}.csv`,
      contentType: 'text/csv; charset=utf-8',
      body: vehiclesToCsv(items),
      meta: { count: items.length, granularity },
    };
  }

  if (format === 'xlsx' || format === 'excel') {
    const excel = await buildExcelBuffer(items, { from, to });
    return {
      format: 'xlsx',
      filename: `fleet-analytics-${from.slice(0, 10)}_${to.slice(0, 10)}.xlsx`,
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: excel,
      isBuffer: true,
      meta: { count: items.length, granularity },
    };
  }

  if (format === 'pdf') {
    const pdf = await buildPdfBuffer(items, { from, to });
    return {
      format: 'pdf',
      filename: `fleet-analytics-${from.slice(0, 10)}_${to.slice(0, 10)}.pdf`,
      contentType: 'application/pdf',
      body: pdf,
      isBuffer: true,
      meta: { count: items.length, granularity },
    };
  }

  throw badRequest('Unsupported export format (csv|xlsx|pdf)');
}

/**
 * ✅ Valid XLSX via ExcelJS (custom zip writer was corrupt → empty sheet in Excel).
 * Export still stays fast because getExport skips live today partials.
 */
async function buildExcelBuffer(items, { from, to }) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'GSN Edge';
  const ws = wb.addWorksheet('Fleet Analytics');

  ws.addRow([`Fleet Analytics ${from.slice(0, 10)} to ${to.slice(0, 10)}`]);
  ws.addRow([`Vehicles: ${items.length}`]);
  ws.addRow([]);
  ws.addRow([
    'Device ID',
    'Name',
    'Engine ON (h)',
    'Moving (h)',
    'Idle (h)',
    'Parked (h)',
    'Distance (km)',
    'Utilization %',
    'Health',
    'Maint Due',
    'Last Online',
  ]);

  for (const r of items) {
    ws.addRow([
      r.deviceId || '',
      r.displayName || '',
      round1((r.engineOnMs || 0) / MS_HOUR),
      round1((r.movingMs || 0) / MS_HOUR),
      round1((r.idleMs || 0) / MS_HOUR),
      round1((r.parkedMs || 0) / MS_HOUR),
      r.distanceKm ?? 0,
      r.utilizationPct ?? 0,
      r.healthStatus || '',
      r.maintenanceDue ? 'yes' : 'no',
      formatExportTimestamp(r.lastOnline),
    ]);
  }

  // Widen columns a bit for readability
  ws.columns.forEach((col) => {
    col.width = 14;
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

async function buildPdfBuffer(items, { from, to }) {
  const PDFDocument = require('pdfkit');
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text('Fleet Analytics Report', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#64748b').text(`${from} → ${to}`);
    doc.moveDown();
    doc.fillColor('#0f172a').fontSize(9);

    for (const r of items.slice(0, 40)) {
      doc.text(
        `${r.displayName} (${r.deviceId}) — util ${r.utilizationPct}% · ${r.healthStatus} · ${round1((r.engineOnMs || 0) / MS_HOUR)}h ON · ${r.distanceKm} km`
      );
    }
    if (items.length > 40) {
      doc.moveDown().text(`…and ${items.length - 40} more vehicles`);
    }
    doc.end();
  });
}

module.exports = {
  getSummary,
  getVehicles,
  getRankings,
  getVehicleDetail,
  getExport,
  computeHealthScore,
  computeFleetScore,
  offlineBucket,
};
