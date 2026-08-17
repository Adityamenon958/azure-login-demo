/**
 * Idempotent rollup job: day → month → year + delta-apply Device.totalEngineMs
 */
const Device = require('../../models/Device');
const TrackerStat = require('../../models/TrackerStat');
const avlRecordRepository = require('../repositories/avlRecordRepository');
const { replayAndUpsertDay } = require('./dayStatStore');
const { updateDeviceLastLive } = require('../services/trackerIngestService');
const { aggregatePeriodMetrics, ENGINE_VERSION } = require('./metricsEngine');
const {
  istDayKey,
  istDayStart,
  istMonthStart,
  istYearStart,
  previousIstDayKey,
  pad2,
} = require('./dateHelpers');

const CONCURRENCY = 5;

async function mapPool(items, limit, fn) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i;
      i += 1;
      results[idx] = await fn(items[idx], idx);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function metricsPayload(m) {
  return {
    engineOnMs: m.engineOnMs || 0,
    engineOffMs: m.engineOffMs || 0,
    movingMs: m.movingMs || 0,
    idleMs: m.idleMs || 0,
    parkedMs: m.parkedMs || 0,
    distanceKm: m.distanceKm || 0,
    distanceSource: m.distanceSource || 'none',
    odometerEndKm: m.odometerEndKm ?? null,
    avgSpeedKmh: m.avgSpeedKmh || 0,
    maxSpeedKmh: m.maxSpeedKmh || 0,
    tripCount: m.tripCount || 0,
    stopCount: m.stopCount || 0,
    longestDriveMs: m.longestDriveMs || 0,
    longestIdleMs: m.longestIdleMs || 0,
    pointCount: m.pointCount || 0,
    gpsGapMs: m.gpsGapMs || 0,
    firstFixAt: m.firstFixAt || null,
    lastFixAt: m.lastFixAt || null,
    activeDays: m.activeDays != null ? m.activeDays : null,
    computedAt: new Date(),
    engineVersion: m.engineVersion || ENGINE_VERSION,
  };
}

/**
 * Upsert one day rollup from AVL (full IST day replay) and delta-apply engine hours to Device.
 * Uses the same incremental engine as live ingest so today → yesterday does not double-count
 * (findOneAndUpdate $set replaces the day doc; Device.totalEngineMs uses engineOnMs delta).
 */
async function upsertDayStat(device, dayKey) {
  return replayAndUpsertDay(device, dayKey);
}

/**
 * Re-aggregate month doc from day docs for a device.
 */
async function reaggregateMonth(device, monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const start = istMonthStart(monthKey);
  const nextMonth =
    m === 12
      ? istMonthStart(`${y + 1}-01`)
      : istMonthStart(`${y}-${pad2(m + 1)}`);

  const days = await TrackerStat.find({
    device: device._id,
    granularity: 'day',
    periodStart: { $gte: start, $lt: nextMonth },
  }).lean();

  const metrics = aggregatePeriodMetrics(days);
  await TrackerStat.findOneAndUpdate(
    { device: device._id, granularity: 'month', periodKey: monthKey },
    {
      $set: {
        device: device._id,
        deviceId: device.deviceId,
        companyName: device.companyName,
        granularity: 'month',
        periodKey: monthKey,
        periodStart: start,
        ...metricsPayload(metrics),
        activeDays: metrics.activeDays || 0,
      },
    },
    { upsert: true, new: true }
  );
}

async function reaggregateYear(device, yearKey) {
  const y = Number(yearKey);
  const start = istYearStart(y);
  const end = istYearStart(y + 1);

  const months = await TrackerStat.find({
    device: device._id,
    granularity: 'month',
    periodStart: { $gte: start, $lt: end },
  }).lean();

  const metrics = aggregatePeriodMetrics(months);
  await TrackerStat.findOneAndUpdate(
    { device: device._id, granularity: 'year', periodKey: yearKey },
    {
      $set: {
        device: device._id,
        deviceId: device.deviceId,
        companyName: device.companyName,
        granularity: 'year',
        periodKey: yearKey,
        periodStart: start,
        ...metricsPayload(metrics),
        activeDays: metrics.activeDays || 0,
      },
    },
    { upsert: true, new: true }
  );
}

/**
 * Process one IST day for all gpsTracker devices.
 */
async function rollupIstDay(dayKey) {
  const devices = await Device.find({ deviceType: 'gpsTracker' })
    .select('_id deviceId companyName')
    .lean();

  const monthKey = dayKey.slice(0, 7);
  const yearKey = dayKey.slice(0, 4);
  let processed = 0;
  let withPoints = 0;

  await mapPool(devices, CONCURRENCY, async (device) => {
    const r = await upsertDayStat(device, dayKey);
    await reaggregateMonth(device, monthKey);
    await reaggregateYear(device, yearKey);
    processed += 1;
    if (r.pointCount > 0) withPoints += 1;
  });

  return { dayKey, devices: devices.length, processed, withPoints };
}

/**
 * Nightly: previous IST day.
 */
async function runNightlyRollup(now = new Date()) {
  const dayKey = previousIstDayKey(now);
  console.log(`[tracker-rollup] nightly start day=${dayKey}`);
  const result = await rollupIstDay(dayKey);
  console.log('[tracker-rollup] nightly done', result);
  return result;
}

/**
 * Catch-up: fill missing completed days, seed today's incremental stats, copy last ping onto Device.
 */
async function runCatchUp({ maxDays = 14 } = {}) {
  const AvlRecord = require('../../models/AvlRecord');
  const oldest = await AvlRecord.findOne({})
    .sort({ timestamp: 1 })
    .select('timestamp')
    .lean();

  let filled = 0;
  let checked = 0;
  if (oldest?.timestamp) {
    const yesterdayKey = previousIstDayKey(new Date());
    let cursor = istDayStart(oldest.timestamp);
    const end = istDayStart(yesterdayKey);
    const keys = [];

    while (cursor.getTime() <= end.getTime() && keys.length < maxDays) {
      keys.push(istDayKey(cursor));
      cursor = new Date(cursor.getTime() + 86400000);
    }

    const recentKeys = keys.slice(-maxDays);
    checked = recentKeys.length;
    for (const key of recentKeys) {
      const exists = await TrackerStat.exists({
        granularity: 'day',
        periodKey: key,
      });
      if (exists) continue;
      await rollupIstDay(key);
      filled += 1;
    }
  } else {
    console.log('[tracker-rollup] catch-up: no AVL records');
  }

  const todaySeed = await seedTodayIncrementalStats();
  const liveBackfill = await backfillDeviceLastLive();

  console.log(
    `[tracker-rollup] catch-up filled=${filled} todaySeeded=${todaySeed.seeded} lastLive=${liveBackfill.updated}`
  );
  return { filled, checked, todaySeeded: todaySeed.seeded, lastLiveUpdated: liveBackfill.updated };
}

/**
 * One-time / startup: replay today's AVL into TrackerStat so Fleet Monitor is not empty after deploy.
 */
async function seedTodayIncrementalStats() {
  const todayKey = istDayKey(new Date());
  const devices = await Device.find({ deviceType: 'gpsTracker' })
    .select('_id deviceId companyName')
    .lean();
  let seeded = 0;
  await mapPool(devices, CONCURRENCY, async (device) => {
    const existing = await TrackerStat.findOne({
      device: device._id,
      granularity: 'day',
      periodKey: todayKey,
    })
      .select('cursor')
      .lean();
    if (existing?.cursor?.processedTs) return;
    await replayAndUpsertDay(device, todayKey);
    seeded += 1;
  });
  return { seeded, devices: devices.length, dayKey: todayKey };
}

/**
 * Copy latest AVL onto Device.lastLive* for vehicles that have never been ingested through the new path.
 */
async function backfillDeviceLastLive() {
  const devices = await Device.find({
    deviceType: 'gpsTracker',
    $or: [{ lastLiveAt: null }, { lastLiveAt: { $exists: false } }],
  })
    .select('_id')
    .lean();
  if (!devices.length) return { updated: 0 };
  const latest = await avlRecordRepository.findLatestByDeviceIds(devices.map((d) => d._id));
  let updated = 0;
  for (const doc of latest) {
    await updateDeviceLastLive(doc.device, doc);
    updated += 1;
  }
  return { updated, missing: devices.length };
}

/**
 * Backfill inclusive range of IST day keys (for script).
 */
async function backfillRange(fromDayKey, toDayKey) {
  let cursor = istDayStart(fromDayKey);
  const end = istDayStart(toDayKey);
  const results = [];
  while (cursor.getTime() <= end.getTime()) {
    const key = istDayKey(cursor);
    // eslint-disable-next-line no-await-in-loop
    const r = await rollupIstDay(key);
    results.push(r);
    cursor = new Date(cursor.getTime() + 86400000);
  }
  return results;
}

module.exports = {
  upsertDayStat,
  reaggregateMonth,
  reaggregateYear,
  rollupIstDay,
  runNightlyRollup,
  runCatchUp,
  backfillRange,
  seedTodayIncrementalStats,
  backfillDeviceLastLive,
};
