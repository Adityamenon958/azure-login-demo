/**
 * Time Fleet Monitor data functions (no HTTP/auth).
 * Usage: node backend/scripts/timeFleetMonitorApis.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../db');
const AvlRecord = require('../models/AvlRecord');
const analyticsService = require('../tracker/analytics/analyticsService');
const trackerLiveService = require('../tracker/services/trackerLiveService');
const {
  seedTodayIncrementalStats,
  backfillDeviceLastLive,
} = require('../tracker/analytics/rollupJob');
const { istDayKey, istDayStart } = require('../tracker/analytics/dateHelpers');

async function timed(label, fn) {
  const t0 = Date.now();
  const value = await fn();
  const ms = Date.now() - t0;
  console.log(`${label.padEnd(28)} ${ms} ms`);
  return { ms, value };
}

async function main() {
  await connectDB();
  const todayKey = istDayKey(new Date());
  const from = istDayStart(todayKey).toISOString();
  const to = new Date().toISOString();
  const scope = {
    role: 'superadmin',
    companyName: '',
    includeReal: true,
    includeDemo: true,
  };

  console.log(`[time] seeding today=${todayKey} …`);
  await seedTodayIncrementalStats();
  await backfillDeviceLastLive();

  let findCount = 0;
  let aggCount = 0;
  const origFind = AvlRecord.find.bind(AvlRecord);
  const origAgg = AvlRecord.aggregate.bind(AvlRecord);
  AvlRecord.find = (...args) => {
    findCount += 1;
    return origFind(...args);
  };
  AvlRecord.aggregate = (...args) => {
    aggCount += 1;
    return origAgg(...args);
  };

  findCount = 0;
  aggCount = 0;
  await timed('live-locations', () => trackerLiveService.getLiveLocations(scope));
  console.log(`  AvlRecord.find=${findCount} aggregate=${aggCount}`);

  findCount = 0;
  aggCount = 0;
  await timed('analytics/summary', () => analyticsService.getSummary(scope, { from, to }));
  console.log(`  AvlRecord.find=${findCount} aggregate=${aggCount}`);

  findCount = 0;
  aggCount = 0;
  await timed('analytics/vehicles', () =>
    analyticsService.getVehicles(scope, { from, to, page: 1, limit: 100 })
  );
  console.log(`  AvlRecord.find=${findCount} aggregate=${aggCount}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
