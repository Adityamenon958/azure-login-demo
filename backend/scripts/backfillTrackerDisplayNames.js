/**
 * ✅ Optional one-time backfill: set displayName = deviceId for Fleet Trackers
 * missing displayName.
 *
 * Usage (from repo root, with .env loaded):
 *   node backend/scripts/backfillTrackerDisplayNames.js
 *   node backend/scripts/backfillTrackerDisplayNames.js --dry-run
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Device = require('../models/Device');

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('Missing MONGO_URI / MONGODB_URI in environment');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const filter = {
    deviceType: 'gpsTracker',
    $or: [
      { displayName: { $exists: false } },
      { displayName: null },
      { displayName: '' },
    ],
  };

  const targets = await Device.find(filter).select('_id deviceId displayName companyName').lean();
  console.log(`Found ${targets.length} Fleet Tracker(s) without displayName`);

  if (dryRun) {
    targets.slice(0, 20).forEach((d) => {
      console.log(`  [dry-run] ${d.deviceId} @ ${d.companyName} → displayName="${d.deviceId}"`);
    });
    if (targets.length > 20) console.log(`  ... and ${targets.length - 20} more`);
    await mongoose.disconnect();
    return;
  }

  let updated = 0;
  for (const d of targets) {
    await Device.updateOne(
      { _id: d._id },
      { $set: { displayName: d.deviceId } }
    );
    updated += 1;
  }

  console.log(`✅ Backfilled displayName on ${updated} device(s)`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
