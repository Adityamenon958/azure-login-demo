const AvlRecord = require('../../models/AvlRecord');
const { advanceTick, buildAvlFromTick } = require('./tick');
const { istDayKey } = require('./schedule');
const { prefetchLegsForWaypoints, attachActiveLegToSim } = require('./roadRouting');

/**
 * Generate thinned historical AVL for last N days (working hours only), then caller runs rollup.
 * Prefetches OSRM legs once so offline replay walks roads without per-tick HTTP.
 */
async function seedHistory(sim, deviceDoc, { days = 7, pointsPerHour = 6 } = {}) {
  if (!deviceDoc?._id || !sim?.imei) return { inserted: 0 };

  const intervalSeconds = Math.max(60, Math.floor(3600 / pointsPerHour));
  const docs = [];
  const now = new Date();

  if (Array.isArray(sim.waypoints) && sim.waypoints.length >= 2) {
    await prefetchLegsForWaypoints(sim.waypoints, { concurrency: 2 });
  }

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
    activeLegKey: null,
    activeLegGeometry: [],
    activeLegDistanceM: 0,
    activeLegSource: null,
  };

  for (let d = days; d >= 1; d -= 1) {
    const dayStart = new Date(now.getTime() - d * 86400000);
    for (let hour = 3; hour <= 12; hour += 1) {
      for (let step = 0; step < pointsPerHour; step += 1) {
        const ts = new Date(dayStart);
        ts.setUTCHours(hour, Math.floor((60 / pointsPerHour) * step), 0, 0);
        // eslint-disable-next-line no-await-in-loop
        cursor = await attachActiveLegToSim(cursor);
        const result = advanceTick(cursor, { now: ts, intervalSeconds });
        cursor = { ...cursor, ...result.runtime };
        docs.push(buildAvlFromTick(cursor, deviceDoc._id, result, ts));
      }
    }
  }

  if (!docs.length) return { inserted: 0 };

  let inserted = 0;
  const chunk = 200;
  for (let i = 0; i < docs.length; i += chunk) {
    const slice = docs.slice(i, i + chunk);
    // eslint-disable-next-line no-await-in-loop
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
