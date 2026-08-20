/**
 * Unset old Report page access flag from company dashboard access docs.
 * Usage: node scripts/cleanup-old-reports-access.js
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
  const result = await db.collection('companydashboardaccesses').updateMany(
    {},
    { $unset: { 'dashboardAccess.reports': '' } }
  );
  console.log(`🧹 Unset dashboardAccess.reports — modified ${result.modifiedCount} doc(s)`);

  await mongoose.disconnect();
  console.log('✅ Done');
}

main().catch((err) => {
  console.error('❌ Cleanup failed:', err);
  process.exit(1);
});
