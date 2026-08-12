/**
 * One-time cleanup of Fleet Behaviour Simulator GPS data.
 *
 * SAFE KEY: SimulatorDevice { deviceType: 'gpsTracker' } → Device by deviceId → AVL/stats by Device._id
 * Does NOT delete by name (e.g. TRK001) alone.
 *
 * Usage:
 *   node scripts/cleanupFleetGpsSimulatorData.js           # dry-run (default)
 *   node scripts/cleanupFleetGpsSimulatorData.js --dry-run
 *   node scripts/cleanupFleetGpsSimulatorData.js --execute
 *   node scripts/cleanupFleetGpsSimulatorData.js --execute --force-stop
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../backend/db');
const SimulatorDevice = require('../backend/models/SimulatorDevice');
const Device = require('../backend/models/Device');
const AvlRecord = require('../backend/models/AvlRecord');
const TrackerStat = require('../backend/models/TrackerStat');

function hasFlag(name) {
  return process.argv.includes(name);
}

async function main() {
  const execute = hasFlag('--execute');
  const forceStop = hasFlag('--force-stop');
  const dryRun = !execute;

  await connectDB();

  const sims = await SimulatorDevice.find({ deviceType: 'gpsTracker' }).lean();
  const simDeviceIds = sims.map((s) => s.deviceId);
  const running = sims.filter((s) => s.isRunning);

  console.log('\n=== Fleet GPS Simulator cleanup ===');
  console.log(`Mode: ${dryRun ? 'DRY-RUN (no deletes)' : 'EXECUTE'}`);
  console.log(`SimulatorDevice gpsTracker rows: ${sims.length}`);

  if (running.length) {
    console.warn(
      `\n⚠️ ${running.length} fleet sim(s) marked isRunning: ${running.map((s) => s.deviceId).join(', ')}`
    );
  }

  if (running.length && execute && !forceStop) {
    console.error('Stop them in the Simulator UI, or re-run with --execute --force-stop');
    await mongoose.disconnect();
    process.exit(1);
  }

  if (running.length && forceStop && execute) {
    await SimulatorDevice.updateMany(
      { deviceType: 'gpsTracker', isRunning: true },
      { $set: { isRunning: false } }
    );
    console.log(`⏹️ Marked ${running.length} sim(s) isRunning=false (timers on a live server may still need Stop)`);
  }

  const devices = [];
  for (const deviceId of simDeviceIds) {
    // eslint-disable-next-line no-await-in-loop
    const doc = await Device.findOne({ deviceId, deviceType: 'gpsTracker' }).lean();
    if (doc) devices.push(doc);
  }
  const deviceObjectIds = devices.map((d) => d._id);

  const avlCount = deviceObjectIds.length
    ? await AvlRecord.countDocuments({ device: { $in: deviceObjectIds } })
    : 0;
  const statsByDevice = deviceObjectIds.length
    ? await TrackerStat.countDocuments({ device: { $in: deviceObjectIds } })
    : 0;
  const statsByDeviceId = simDeviceIds.length
    ? await TrackerStat.countDocuments({ deviceId: { $in: simDeviceIds } })
    : 0;

  // Real / non-sim gps trackers (no matching SimulatorDevice)
  const allGps = await Device.find({ deviceType: 'gpsTracker' }).select('deviceId imei').lean();
  const nonSimGps = allGps.filter((d) => !simDeviceIds.includes(d.deviceId));
  const nonSimIds = nonSimGps.map((d) => d._id);
  const nonSimAvlBefore = nonSimIds.length
    ? await AvlRecord.countDocuments({ device: { $in: nonSimIds } })
    : 0;

  console.log('\n--- Candidates (join via SimulatorDevice) ---');
  for (const s of sims) {
    const dev = devices.find((d) => d.deviceId === s.deviceId);
    console.log(
      `  sim=${s.deviceId} company=${s.companyName || s.name} imei=${s.imei || '—'} ` +
      `deviceObjectId=${dev?._id || 'MISSING'} running=${!!s.isRunning}`
    );
  }
  console.log('\n--- Counts to delete ---');
  console.log(`  simulatordevices (gpsTracker): ${sims.length}`);
  console.log(`  devices (joined):              ${devices.length}`);
  console.log(`  avlrecords:                    ${avlCount}`);
  console.log(`  trackerstats (by device _id):  ${statsByDevice}`);
  console.log(`  trackerstats (by deviceId):    ${statsByDeviceId}`);
  console.log('\n--- Untouched check (gpsTracker with NO SimulatorDevice) ---');
  console.log(`  devices: ${nonSimGps.length}`);
  console.log(`  avlrecords for those devices: ${nonSimAvlBefore}`);
  if (nonSimGps.length) {
    console.log(`  ids: ${nonSimGps.map((d) => d.deviceId).join(', ')}`);
  }

  if (dryRun) {
    console.log('\n✅ Dry-run complete. Re-run with --execute to delete the candidates above.');
    await mongoose.disconnect();
    process.exit(0);
  }

  if (!sims.length && !devices.length) {
    console.log('\nNothing to delete.');
    await mongoose.disconnect();
    return;
  }

  let avlDeleted = 0;
  let statsDeleted = 0;
  if (deviceObjectIds.length) {
    const avlRes = await AvlRecord.deleteMany({ device: { $in: deviceObjectIds } });
    avlDeleted = avlRes.deletedCount || 0;
    const statsRes = await TrackerStat.deleteMany({
      $or: [
        { device: { $in: deviceObjectIds } },
        { deviceId: { $in: simDeviceIds } },
      ],
    });
    statsDeleted = statsRes.deletedCount || 0;
  } else if (simDeviceIds.length) {
    const statsRes = await TrackerStat.deleteMany({ deviceId: { $in: simDeviceIds } });
    statsDeleted = statsRes.deletedCount || 0;
  }

  const deviceRes = deviceObjectIds.length
    ? await Device.deleteMany({ _id: { $in: deviceObjectIds } })
    : { deletedCount: 0 };
  const simRes = await SimulatorDevice.deleteMany({ deviceType: 'gpsTracker' });

  const nonSimAvlAfter = nonSimIds.length
    ? await AvlRecord.countDocuments({ device: { $in: nonSimIds } })
    : 0;

  console.log('\n--- Deleted ---');
  console.log(`  avlrecords:        ${avlDeleted}`);
  console.log(`  trackerstats:      ${statsDeleted}`);
  console.log(`  devices:           ${deviceRes.deletedCount || 0}`);
  console.log(`  simulatordevices:  ${simRes.deletedCount || 0}`);
  console.log('\n--- Verification (non-sim gpsTracker AVL) ---');
  console.log(`  before=${nonSimAvlBefore} after=${nonSimAvlAfter} ` +
    `${nonSimAvlBefore === nonSimAvlAfter ? '✅ unchanged' : '❌ CHANGED — investigate'}`);

  await mongoose.disconnect();
  console.log('\n✅ Cleanup execute finished.');
  process.exit(0);
}

main().catch(async (err) => {
  console.error('❌ Cleanup failed:', err);
  try {
    await mongoose.disconnect();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
