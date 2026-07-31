/**
 * One-shot / resumable backfill of trackerstats from avlrecords.
 *
 * Usage:
 *   node backend/scripts/backfillTrackerStats.js
 *   node backend/scripts/backfillTrackerStats.js 2026-07-01 2026-07-30
 */
require('dotenv').config();
const connectDB = require('../db');
const AvlRecord = require('../models/AvlRecord');
const { backfillRange } = require('../tracker/analytics/rollupJob');
const {
  istDayKey,
  istDayStart,
  previousIstDayKey,
} = require('../tracker/analytics/dateHelpers');

async function main() {
  await connectDB();

  let fromKey = process.argv[2];
  let toKey = process.argv[3];

  if (!fromKey || !toKey) {
    const oldest = await AvlRecord.findOne({})
      .sort({ timestamp: 1 })
      .select('timestamp')
      .lean();
    if (!oldest?.timestamp) {
      console.log('No AVL records found — nothing to backfill.');
      process.exit(0);
    }
    fromKey = fromKey || istDayKey(oldest.timestamp);
    toKey = toKey || previousIstDayKey(new Date());
  }

  console.log(`[backfill] from=${fromKey} to=${toKey}`);
  const start = Date.now();
  const results = await backfillRange(fromKey, toKey);
  console.log(
    `[backfill] done days=${results.length} in ${Math.round((Date.now() - start) / 1000)}s`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('[backfill] failed', err);
  process.exit(1);
});
