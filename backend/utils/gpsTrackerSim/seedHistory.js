const AvlRecord = require('../../models/AvlRecord');
const { advanceTick, buildAvlFromTick } = require('./tick');
const { istDayKey } = require('./schedule');

/**
 * Generate thinned historical AVL for last N days (working hours only), then caller runs rollup.
 */
async function seedHistory(sim, deviceDoc, { days = 7, pointsPerHour = 6 } = {}) {
  if (!deviceDoc?._id || !sim?.imei) return { inserted: 0 };

  const intervalSeconds = Math.max(60, Math.floor(3600 / pointsPerHour));
  const docs = [];
  const now = new Date();

  // Clone mutable sim state for offline replay
  let cursor = {
    ...sim,
    fleetState: 'OFFLINE',
    stateEnteredAt: null,
    currentWaypointIndex: 0,
    segmentProgress: 0,
    currentLat: null,
    currentLon: null,
    currentSpeedKmh: 0,
    odometerMeters: sim.odometerMeters || 0,
    tripDistanceMeters: 0,
  };

  for (let d = days; d >= 1; d -= 1) {
    const dayStart = new Date(now.getTime() - d * 86400000);
    // Simulate from ~08:30 to ~17:30 IST roughly using local offset trick: iterate hours 3–12 UTC ≈ morning–evening IST
    for (let hour = 3; hour <= 12; hour += 1) {
      for (let step = 0; step < pointsPerHour; step += 1) {
        const ts = new Date(dayStart);
        ts.setUTCHours(hour, Math.floor((60 / pointsPerHour) * step), 0, 0);
        const result = advanceTick(cursor, { now: ts, intervalSeconds });
        cursor = { ...cursor, ...result.runtime };
        docs.push(buildAvlFromTick(cursor, deviceDoc._id, result, ts));
      }
    }
  }

  if (!docs.length) return { inserted: 0 };

  // Bulk insert in chunks
  let inserted = 0;
  const chunk = 200;
  for (let i = 0; i < docs.length; i += chunk) {
    const slice = docs.slice(i, i + chunk);
    await AvlRecord.insertMany(slice, { ordered: false });
    inserted += slice.length;
  }

  return {
    inserted,
    fromDay: istDayKey(new Date(now.getTime() - days * 86400000)),
    toDay: istDayKey(new Date(now.getTime() - 86400000)),
    finalOdometer: cursor.odometerMeters,
  };
}

module.exports = { seedHistory };
