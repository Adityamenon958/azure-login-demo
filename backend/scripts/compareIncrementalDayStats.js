/**
 * Compare incremental day replay vs full computeDailyMetrics using live Mongo AVL.
 *
 * Usage: node backend/scripts/compareIncrementalDayStats.js [deviceId]
 */
require('dotenv').config();
const connectDB = require('../db');
const Device = require('../models/Device');
const avlRecordRepository = require('../tracker/repositories/avlRecordRepository');
const { computeDailyMetrics } = require('../tracker/analytics/metricsEngine');
const { replayDailyMetrics } = require('../tracker/analytics/incrementalDayStats');
const { istDayKey, istDayStart, istDayEndExclusive } = require('../tracker/analytics/dateHelpers');

const FIELDS = [
  'distanceKm',
  'movingMs',
  'idleMs',
  'parkedMs',
  'engineOnMs',
  'tripCount',
  'stopCount',
  'avgSpeedKmh',
  'maxSpeedKmh',
  'pointCount',
];

async function compareDevice(device, dayKey) {
  const from = istDayStart(dayKey);
  const to = new Date(istDayEndExclusive(dayKey).getTime() - 1);
  const end = new Date(Math.min(Date.now(), to.getTime()));
  const docs = await avlRecordRepository.findHistoryAscForJourney({
    deviceObjectId: device._id,
    from,
    to: end,
  });
  const full = computeDailyMetrics(docs);
  const inc = replayDailyMetrics(docs, { from, to: end });
  const diffs = [];
  for (const key of FIELDS) {
    const a = Number(inc[key]) || 0;
    const b = Number(full[key]) || 0;
    const tol = key.includes('Km') || key.includes('Kmh') ? 0.05 : 2;
    if (Math.abs(a - b) > tol) diffs.push({ key, incremental: a, full: b });
  }
  return { deviceId: device.deviceId, points: docs.length, diffs };
}

async function main() {
  await connectDB();
  const dayKey = istDayKey(new Date());
  const only = process.argv[2];
  const query = { deviceType: 'gpsTracker' };
  if (only) query.deviceId = only;
  const devices = await Device.find(query).select('_id deviceId').lean();
  console.log(`[compare] day=${dayKey} devices=${devices.length}`);
  let mismatches = 0;
  for (const device of devices) {
    const r = await compareDevice(device, dayKey);
    if (r.diffs.length) {
      mismatches += 1;
      console.log(`MISMATCH ${r.deviceId} points=${r.points}`, r.diffs);
    } else {
      console.log(`ok ${r.deviceId} points=${r.points}`);
    }
  }
  console.log(`[compare] mismatches=${mismatches}/${devices.length}`);
  process.exit(mismatches ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
