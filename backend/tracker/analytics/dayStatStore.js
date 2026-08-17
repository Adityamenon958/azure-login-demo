/**
 * Persist incremental IST-day TrackerStat for one device.
 * Optimistic lock on cursor.processedTs so two writers cannot double-count.
 */
const TrackerStat = require('../../models/TrackerStat');
const Device = require('../../models/Device');
const avlRecordRepository = require('../repositories/avlRecordRepository');
const {
  applyIncrementalPoint,
  replayDailyMetrics,
  stateFromPersisted,
} = require('./incrementalDayStats');
const {
  istDayKey,
  istDayStart,
  istDayEndExclusive,
} = require('./dateHelpers');
const { ENGINE_VERSION } = require('./metricsEngine');

const MAX_RETRIES = 5;

function metricsSet(device, dayKey, periodStart, state) {
  return {
    device: device._id,
    deviceId: device.deviceId,
    companyName: device.companyName,
    granularity: 'day',
    periodKey: dayKey,
    periodStart,
    engineOnMs: state.engineOnMs || 0,
    engineOffMs: state.engineOffMs || 0,
    movingMs: state.movingMs || 0,
    idleMs: state.idleMs || 0,
    parkedMs: state.parkedMs || 0,
    distanceKm: state.distanceKm || 0,
    distanceSource: state.distanceSource || 'none',
    odometerEndKm: state.odometerEndKm ?? null,
    avgSpeedKmh: state.avgSpeedKmh || 0,
    maxSpeedKmh: state.maxSpeedKmh || 0,
    tripCount: state.tripCount || 0,
    stopCount: state.stopCount || 0,
    longestDriveMs: state.longestDriveMs || 0,
    longestIdleMs: state.longestIdleMs || 0,
    pointCount: state.pointCount || 0,
    gpsGapMs: state.gpsGapMs || 0,
    firstFixAt: state.firstFixAt || null,
    lastFixAt: state.lastFixAt || null,
    activeDays: state.pointCount > 0 ? 1 : 0,
    hourlyBuckets: state.hourlyBuckets || [],
    cursor: state.cursor || null,
    computedAt: new Date(),
    engineVersion: state.engineVersion || ENGINE_VERSION,
  };
}

async function loadDayDoc(deviceObjectId, dayKey) {
  return TrackerStat.findOne({
    device: deviceObjectId,
    granularity: 'day',
    periodKey: dayKey,
  }).lean();
}

/**
 * Replay all AVL for an IST day into TrackerStat (seed / nightly finalize).
 * Replaces the day document — does not add on top of existing totals.
 */
async function replayAndUpsertDay(device, dayKey) {
  const from = istDayStart(dayKey);
  const toExclusive = istDayEndExclusive(dayKey);
  const end = new Date(Math.min(Date.now(), toExclusive.getTime() - 1));
  const docs = await avlRecordRepository.findHistoryAscForJourney({
    deviceObjectId: device._id,
    from,
    to: end,
  });
  const prev = await loadDayDoc(device._id, dayKey);
  const prevEngineOn = prev?.engineOnMs || 0;
  const state = replayDailyMetrics(docs, { from, to: end });
  const payload = metricsSet(device, dayKey, from, state);

  await TrackerStat.findOneAndUpdate(
    { device: device._id, granularity: 'day', periodKey: dayKey },
    { $set: payload },
    { upsert: true, new: true }
  );

  const deltaEngine = (state.engineOnMs || 0) - prevEngineOn;
  if (deltaEngine !== 0) {
    await Device.updateOne(
      { _id: device._id },
      {
        $inc: { totalEngineMs: deltaEngine },
        $set: { engineMsUpdatedAt: new Date() },
      }
    );
  }

  return { dayKey, pointCount: state.pointCount, deltaEngine };
}

function processedFilter(processedTs) {
  if (processedTs) {
    return { 'cursor.processedTs': new Date(processedTs) };
  }
  return {
    $or: [
      { cursor: null },
      { cursor: { $exists: false } },
      { 'cursor.processedTs': null },
      { 'cursor.processedTs': { $exists: false } },
    ],
  };
}

/**
 * Apply one new AVL point to the IST day of that point's timestamp.
 */
async function applyAvlToDayStat(device, avlDoc) {
  const ts = avlDoc?.timestamp ? new Date(avlDoc.timestamp) : null;
  if (!ts || Number.isNaN(ts.getTime())) return { skipped: true, reason: 'no-timestamp' };

  const dayKey = istDayKey(ts);
  const from = istDayStart(dayKey);
  const toExclusive = istDayEndExclusive(dayKey);
  const end = new Date(Math.min(Date.now(), toExclusive.getTime() - 1));

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    let doc = await loadDayDoc(device._id, dayKey);

    // First write of the day (or pre-incremental doc without a cursor): seed from AVL once
    if (!doc || !doc.cursor || !doc.cursor.processedTs) {
      await replayAndUpsertDay(device, dayKey);
      doc = await loadDayDoc(device._id, dayKey);
    }

    const prevEngineOn = doc?.engineOnMs || 0;
    const before = stateFromPersisted(doc);
    if (
      before.cursor.processedTs &&
      ts.getTime() <= new Date(before.cursor.processedTs).getTime()
    ) {
      return { skipped: true, reason: 'already-processed', dayKey };
    }

    const next = applyIncrementalPoint(before, avlDoc, { from, to: end });
    const payload = metricsSet(device, dayKey, from, next);
    const expectedProcessed = before.cursor.processedTs || null;

    const updated = await TrackerStat.findOneAndUpdate(
      {
        device: device._id,
        granularity: 'day',
        periodKey: dayKey,
        ...processedFilter(expectedProcessed),
      },
      { $set: payload },
      { new: true }
    );

    if (!updated) {
      continue;
    }

    const deltaEngine = (next.engineOnMs || 0) - prevEngineOn;
    if (deltaEngine !== 0) {
      await Device.updateOne(
        { _id: device._id },
        {
          $inc: { totalEngineMs: deltaEngine },
          $set: { engineMsUpdatedAt: new Date() },
        }
      );
    }

    return { skipped: false, dayKey, pointCount: next.pointCount };
  }

  throw new Error(`day-stat optimistic lock exhausted device=${device.deviceId} day=${dayKey}`);
}

module.exports = {
  applyAvlToDayStat,
  replayAndUpsertDay,
  loadDayDoc,
};
