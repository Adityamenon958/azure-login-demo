/**
 * One-shot Mongo cleanup for the removed Device Dashboard:
 * - drop LevelSensor + Alarm collections (old names + mongoose pluralizations)
 * - delete Device docs with deviceType levelSensor
 * - unset dashboardAccess.dashboard on CompanyDashboardAccess
 *
 * Usage: node scripts/cleanup-old-device-dashboard-db.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('❌ MONGO_URI missing in .env');
    process.exit(1);
  }

  await mongoose.connect(uri, { family: 4, serverSelectionTimeoutMS: 45000 });
  console.log('✅ Connected');

  const db = mongoose.connection.db;

  const collectionNames = (await db.listCollections().toArray()).map((c) => c.name);
  console.log('Collections:', collectionNames.join(', '));

  const dropCandidates = [
    'levelsensors',
    'LevelSensors',
    'levelsensor',
    'alarms',
    'Alarms',
  ];

  for (const name of dropCandidates) {
    if (!collectionNames.includes(name)) continue;
    const count = await db.collection(name).countDocuments();
    await db.collection(name).drop();
    console.log(`🗑️  Dropped ${name} (${count} docs)`);
  }

  const deviceResult = await db.collection('devices').deleteMany({
    deviceType: { $in: ['levelSensor', 'LevelSensor', 'levelsensor'] },
  });
  console.log(`🗑️  Deleted levelSensor devices: ${deviceResult.deletedCount}`);

  const accessResult = await db.collection('companydashboardaccesses').updateMany(
    {},
    { $unset: { 'dashboardAccess.dashboard': '' } }
  );
  // Also try alternate collection name
  let accessResult2 = { modifiedCount: 0 };
  try {
    accessResult2 = await db.collection('companydashboardaccess').updateMany(
      {},
      { $unset: { 'dashboardAccess.dashboard': '' } }
    );
  } catch {
    /* ignore */
  }

  console.log(
    `🧹 Unset dashboardAccess.dashboard — modified ${accessResult.modifiedCount + accessResult2.modifiedCount} company access doc(s)`
  );

  await mongoose.disconnect();
  console.log('✅ Done');
}

main().catch((err) => {
  console.error('❌ Cleanup failed:', err);
  process.exit(1);
});
