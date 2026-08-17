const assert = require('assert');
const { computeDailyMetrics, computeHourlyMetrics } = require('../analytics/metricsEngine');
const {
  replayDailyMetrics,
  applyIncrementalPoint,
  emptyDayState,
} = require('../analytics/incrementalDayStats');

function point({ t, lat = 19.04, lon = 73.02, speed = 0, ignition = false, movement = false, odo }) {
  const ts = new Date(t).getTime();
  return {
    timestamp: new Date(ts),
    latitude: lat,
    longitude: lon,
    speed,
    angle: 0,
    satellites: 8,
    altitude: 10,
    ioElements: [
      { id: 239, value: ignition ? 1 : 0 },
      { id: 240, value: movement ? 1 : 0 },
      ...(odo != null ? [{ id: 16, value: odo }] : []),
    ],
  };
}

function assertClose(actual, expected, label, tol = 2) {
  const a = Number(actual) || 0;
  const e = Number(expected) || 0;
  assert.ok(
    Math.abs(a - e) <= tol,
    `${label}: incremental ${a} vs full ${e}`
  );
}

function compare(docs, label) {
  const full = computeDailyMetrics(docs);
  const inc = replayDailyMetrics(docs, {
    from: docs[0].timestamp,
    to: docs[docs.length - 1].timestamp,
  });
  assertClose(inc.engineOnMs, full.engineOnMs, `${label} engineOnMs`);
  assertClose(inc.engineOffMs, full.engineOffMs, `${label} engineOffMs`);
  assertClose(inc.movingMs, full.movingMs, `${label} movingMs`);
  assertClose(inc.idleMs, full.idleMs, `${label} idleMs`);
  assertClose(inc.parkedMs, full.parkedMs, `${label} parkedMs`);
  assertClose(inc.distanceKm, full.distanceKm, `${label} distanceKm`, 0.05);
  assert.strictEqual(inc.tripCount, full.tripCount, `${label} tripCount`);
  assert.strictEqual(inc.stopCount, full.stopCount, `${label} stopCount`);
  assertClose(inc.avgSpeedKmh, full.avgSpeedKmh, `${label} avgSpeedKmh`, 0.05);
  assertClose(inc.maxSpeedKmh, full.maxSpeedKmh, `${label} maxSpeedKmh`, 0.05);
  assert.strictEqual(inc.pointCount, full.pointCount, `${label} pointCount`);
  console.log(`ok ${label}`);
}

function testEngineOn() {
  compare(
    [
      point({ t: '2026-07-29T00:00:00.000Z', ignition: true, speed: 0 }),
      point({ t: '2026-07-29T01:00:00.000Z', ignition: false, speed: 0 }),
    ],
    'engineOn'
  );
}

function testMovingTrip() {
  compare(
    [
      point({ t: '2026-07-29T00:00:00.000Z', speed: 40, movement: true, ignition: true, lat: 19.0, lon: 73.0, odo: 1000 }),
      point({ t: '2026-07-29T00:30:00.000Z', speed: 45, movement: true, ignition: true, lat: 19.01, lon: 73.01, odo: 2500 }),
      point({ t: '2026-07-29T01:00:00.000Z', speed: 0, movement: false, ignition: true, lat: 19.01, lon: 73.01, odo: 2500 }),
    ],
    'movingTrip'
  );
}

function testParkedStop() {
  compare(
    [
      point({ t: '2026-07-29T00:00:00.000Z', speed: 0, ignition: false, lat: 19.04, lon: 73.02 }),
      point({ t: '2026-07-29T00:04:00.000Z', speed: 0, ignition: false, lat: 19.04, lon: 73.02 }),
      point({ t: '2026-07-29T00:08:00.000Z', speed: 0, ignition: false, lat: 19.04, lon: 73.02 }),
    ],
    'parkedStop'
  );
}

function testIdleStop() {
  compare(
    [
      point({ t: '2026-07-29T00:00:00.000Z', speed: 0, ignition: true, lat: 19.04, lon: 73.02 }),
      point({ t: '2026-07-29T00:05:00.000Z', speed: 0, ignition: true, lat: 19.04, lon: 73.02 }),
    ],
    'idleStop'
  );
}

function testIdempotentDuplicate() {
  const docs = [
    point({ t: '2026-07-29T00:00:00.000Z', speed: 40, movement: true, ignition: true, lat: 19.0, lon: 73.0 }),
    point({ t: '2026-07-29T00:10:00.000Z', speed: 40, movement: true, ignition: true, lat: 19.01, lon: 73.01 }),
  ];
  let state = emptyDayState();
  state = applyIncrementalPoint(state, docs[0]);
  state = applyIncrementalPoint(state, docs[1]);
  const once = { ...state };
  state = applyIncrementalPoint(state, docs[1]);
  assert.strictEqual(state.movingMs, once.movingMs);
  assert.strictEqual(state.pointCount, once.pointCount);
  assert.strictEqual(state.distanceKm, once.distanceKm);
  console.log('ok idempotentDuplicate');
}

function testHourlyMatches() {
  const docs = [
    point({
      t: '2026-08-12T19:25:00.000Z',
      speed: 40,
      movement: true,
      ignition: true,
      lat: 19.0,
      lon: 73.0,
    }),
    point({
      t: '2026-08-12T19:35:00.000Z',
      speed: 40,
      movement: true,
      ignition: true,
      lat: 19.01,
      lon: 73.01,
    }),
  ];
  const from = new Date('2026-08-12T18:30:00.000Z');
  const to = new Date('2026-08-12T20:30:00.000Z');
  const full = computeHourlyMetrics(docs, { from, to });
  const inc = replayDailyMetrics(docs, { from, to });
  const h0 = inc.hourlyBuckets.find((h) => h.periodKey.endsWith('T00'));
  const h1 = inc.hourlyBuckets.find((h) => h.periodKey.endsWith('T01'));
  const f0 = full.find((h) => h.periodKey.endsWith('T00'));
  const f1 = full.find((h) => h.periodKey.endsWith('T01'));
  assert.ok(h0 && h1 && f0 && f1);
  assertClose(h0.movingMs, f0.movingMs, 'hourly h0', 2000);
  assertClose(h1.movingMs, f1.movingMs, 'hourly h1', 2000);
  console.log('ok hourlyMatches');
}

function testMixedDriveAndPark() {
  compare(
    [
      point({ t: '2026-07-29T00:00:00.000Z', speed: 40, movement: true, ignition: true, lat: 19.0, lon: 73.0 }),
      point({ t: '2026-07-29T00:20:00.000Z', speed: 35, movement: true, ignition: true, lat: 19.02, lon: 73.02 }),
      point({ t: '2026-07-29T00:21:00.000Z', speed: 0, movement: false, ignition: false, lat: 19.02, lon: 73.02 }),
      point({ t: '2026-07-29T00:26:00.000Z', speed: 0, movement: false, ignition: false, lat: 19.02, lon: 73.02 }),
      point({ t: '2026-07-29T00:27:00.000Z', speed: 30, movement: true, ignition: true, lat: 19.03, lon: 73.03 }),
      point({ t: '2026-07-29T00:40:00.000Z', speed: 30, movement: true, ignition: true, lat: 19.05, lon: 73.05 }),
    ],
    'mixedDriveAndPark'
  );
}

testEngineOn();
testMovingTrip();
testParkedStop();
testIdleStop();
testIdempotentDuplicate();
testHourlyMatches();
testMixedDriveAndPark();
console.log('incrementalDayStats tests passed');
