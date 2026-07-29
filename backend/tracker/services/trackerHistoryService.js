const deviceRepository = require('../repositories/deviceRepository');
const avlRecordRepository = require('../repositories/avlRecordRepository');
const { toHistoryPointDto } = require('../mappers/trackerDtoMapper');
const { mapAvlRecord } = require('../mappers/avlMapper');
const { notFound } = require('../utils/apiResponse');
const {
  parseRequiredRange,
  parseLimit,
  parseInterval,
} = require('../utils/timeRange');
const { MOVING_SPEED_KMH } = require('../constants/trackerStatus');

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

async function getHistory({
  role,
  companyName,
  deviceId,
  companyNameFilter,
  from,
  to,
  limit,
  cursor,
}) {
  const { from: fromDate, to: toDate } = parseRequiredRange(from, to);
  const limitNum = parseLimit(limit, 500, 5000);

  const device = await resolveDevice({
    role,
    companyName,
    deviceId,
    companyNameFilter,
  });

  const { points, nextCursor } = await avlRecordRepository.findHistoryByDeviceId({
    deviceObjectId: device._id,
    from: fromDate,
    to: toDate,
    limit: limitNum,
    cursorTimestamp: cursor || null,
  });

  return {
    deviceId: device.deviceId,
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    points: points.map(toHistoryPointDto).filter(Boolean),
    nextCursor,
  };
}

async function getStatistics({
  role,
  companyName,
  deviceId,
  companyNameFilter,
  from,
  to,
  interval,
}) {
  const { from: fromDate, to: toDate } = parseRequiredRange(from, to);
  const { interval: intervalKey, intervalMs } = parseInterval(interval || '5m');

  const device = await resolveDevice({
    role,
    companyName,
    deviceId,
    companyNameFilter,
  });

  const docs = await avlRecordRepository.findHistoryAscForStats({
    deviceObjectId: device._id,
    from: fromDate,
    to: toDate,
  });

  const buckets = new Map();

  for (const doc of docs) {
    const ts = new Date(doc.timestamp).getTime();
    if (!Number.isFinite(ts)) continue;
    const bucketStartMs = Math.floor(ts / intervalMs) * intervalMs;
    const key = String(bucketStartMs);

    if (!buckets.has(key)) {
      buckets.set(key, {
        bucketStart: new Date(bucketStartMs).toISOString(),
        speeds: [],
        movingMs: 0,
        pointCount: 0,
        lastTs: null,
      });
    }

    const bucket = buckets.get(key);
    const mapped = mapAvlRecord(doc);
    const speed = Number(mapped?.speed) || 0;
    bucket.speeds.push(speed);
    bucket.pointCount += 1;
    if (mapped?.batteryVoltage != null) {
      if (!bucket.batteries) bucket.batteries = [];
      bucket.batteries.push(mapped.batteryVoltage);
    }

    const isMoving = speed >= MOVING_SPEED_KMH || mapped?.movement === true;
    if (isMoving && bucket.lastTs != null) {
      bucket.movingMs += Math.max(0, ts - bucket.lastTs);
    }
    bucket.lastTs = ts;
  }

  const series = Array.from(buckets.values()).map((b) => {
    const avgSpeed =
      b.speeds.length > 0
        ? b.speeds.reduce((a, c) => a + c, 0) / b.speeds.length
        : 0;
    const maxSpeed = b.speeds.length > 0 ? Math.max(...b.speeds) : 0;
    const avgBattery =
      b.batteries && b.batteries.length > 0
        ? b.batteries.reduce((a, c) => a + c, 0) / b.batteries.length
        : null;
    return {
      bucketStart: b.bucketStart,
      avgSpeed: Math.round(avgSpeed * 100) / 100,
      maxSpeed: Math.round(maxSpeed * 100) / 100,
      movingMinutes: Math.round((b.movingMs / 60000) * 100) / 100,
      pointCount: b.pointCount,
      avgBatteryVoltage:
        avgBattery != null ? Math.round(avgBattery * 1000) / 1000 : null,
    };
  });

  return {
    deviceId: device.deviceId,
    interval: intervalKey,
    series,
  };
}

module.exports = {
  getHistory,
  getStatistics,
};
