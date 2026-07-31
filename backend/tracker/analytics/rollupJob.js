/**
 * Idempotent rollup job: day → month → year + delta-apply Device.totalEngineMs
 */
const Device = require('../../models/Device');
const TrackerStat = require('../../models/TrackerStat');
const avlRecordRepository = require('../repositories/avlRecordRepository');
const { computeDailyMetrics, aggregatePeriodMetrics, ENGINE_VERSION } = require('./metricsEngine');
const {
  istDayKey,
  istMonthKey,
  istYearKey,
  istDayStart,
  istDayEndExclusive,
  istMonthStart,
  istYearStart,
  previousIstDayKey,
  pad2,
  toIstParts,
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
 * Upsert one day rollup and delta-apply engine hours to Device.
 */
async function upsertDayStat(device, dayKey) {
  const from = istDayStart(dayKey);
  const to = istDayEndExclusive(dayKey);
  const docs = await avlRecordRepository.findHistoryAscForJourney({
    deviceObjectId: device._id,
    from,
    to: new Date(to.getTime() - 1),
  });

  const metrics = computeDailyMetrics(docs);
  const prev = await TrackerStat.findOne({
    device: device._id,
    granularity: 'day',
    periodKey: dayKey,
  }).lean();

  const prevEngineOn = prev?.engineOnMs || 0;
  const deltaEngine = (metrics.engineOnMs || 0) - prevEngineOn;

  await TrackerStat.findOneAndUpdate(
    { device: device._id, granularity: 'day', periodKey: dayKey },
    {
      $set: {
        device: device._id,
        deviceId: device.deviceId,
        companyName: device.companyName,
        granularity: 'day',
        periodKey: dayKey,
        periodStart: from,
        ...metricsPayload(metrics),
        activeDays: metrics.pointCount > 0 ? 1 : 0,
      },
    },
    { upsert: true, new: true }
  );

  if (deltaEngine !== 0) {
    await Device.updateOne(
      { _id: device._id },
      {
        $inc: { totalEngineMs: deltaEngine },
        $set: { engineMsUpdatedAt: new Date() },
      }
    );
  }

  return { dayKey, deltaEngine, pointCount: metrics.pointCount };
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
 * Catch-up: find oldest AVL timestamp and fill missing day keys up to yesterday.
 * Limited to `maxDays` to avoid huge startup blocks.
 */
async function runCatchUp({ maxDays = 14 } = {}) {
  const AvlRecord = require('../../models/AvlRecord');
  const oldest = await AvlRecord.findOne({})
    .sort({ timestamp: 1 })
    .select('timestamp')
    .lean();
  if (!oldest?.timestamp) {
    console.log('[tracker-rollup] catch-up: no AVL records');
    return { filled: 0 };
  }

  const yesterdayKey = previousIstDayKey(new Date());
  let cursor = istDayStart(oldest.timestamp);
  const end = istDayStart(yesterdayKey);
  const keys = [];

  while (cursor.getTime() <= end.getTime() && keys.length < maxDays) {
    keys.push(istDayKey(cursor));
    cursor = new Date(cursor.getTime() + 86400000);
  }

  // Prefer most recent missing days
  const recentKeys = keys.slice(-maxDays);
  let filled = 0;
  for (const key of recentKeys) {
    const exists = await TrackerStat.exists({
      granularity: 'day',
      periodKey: key,
    });
    if (exists) continue;
    await rollupIstDay(key);
    filled += 1;
  }

  console.log(`[tracker-rollup] catch-up filled=${filled}`);
  return { filled, checked: recentKeys.length };
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
};
