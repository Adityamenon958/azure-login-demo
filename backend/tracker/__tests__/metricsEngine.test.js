const assert = require('assert');
const {
  computeDailyMetrics,
  aggregatePeriodMetrics,
  computeEngineDurations,
} = require('../analytics/metricsEngine');

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

function testEmpty() {
  const m = computeDailyMetrics([]);
  assert.strictEqual(m.pointCount, 0);
  assert.strictEqual(m.engineOnMs, 0);
  assert.strictEqual(m.distanceSource, 'none');
  console.log('ok empty');
}

function testEngineOn() {
  // Two points 1 hour apart, ignition on for first → engineOnMs ≈ 3600000
  const docs = [
    point({ t: '2026-07-29T00:00:00.000Z', ignition: true, speed: 0 }),
    point({ t: '2026-07-29T01:00:00.000Z', ignition: false, speed: 0 }),
  ];
  const m = computeDailyMetrics(docs);
  assert.ok(m.engineOnMs >= 3600000 - 1000 && m.engineOnMs <= 3600000 + 1000);
  assert.strictEqual(m.pointCount, 2);
  console.log('ok engineOn');
}

function testMoving() {
  const docs = [
    point({ t: '2026-07-29T00:00:00.000Z', speed: 40, movement: true, ignition: true, lat: 19.0, lon: 73.0, odo: 1000 }),
    point({ t: '2026-07-29T00:30:00.000Z', speed: 45, movement: true, ignition: true, lat: 19.01, lon: 73.01, odo: 2500 }),
    point({ t: '2026-07-29T01:00:00.000Z', speed: 0, movement: false, ignition: true, lat: 19.01, lon: 73.01, odo: 2500 }),
  ];
  const m = computeDailyMetrics(docs);
  assert.ok(m.movingMs > 0);
  assert.ok(m.distanceKm > 0);
  assert.ok(m.maxSpeedKmh >= 40);
  console.log('ok moving');
}

function testAggregate() {
  const a = computeDailyMetrics([
    point({ t: '2026-07-29T00:00:00.000Z', ignition: true }),
    point({ t: '2026-07-29T01:00:00.000Z', ignition: true }),
  ]);
  const b = computeDailyMetrics([
    point({ t: '2026-07-30T00:00:00.000Z', ignition: true }),
    point({ t: '2026-07-30T02:00:00.000Z', ignition: false }),
  ]);
  const agg = aggregatePeriodMetrics([a, b]);
  assert.strictEqual(agg.engineOnMs, a.engineOnMs + b.engineOnMs);
  assert.ok(agg.activeDays >= 1);
  console.log('ok aggregate');
}

function testEngineDurationsHelper() {
  const raw = [
    { ts: 0, ignition: true },
    { ts: 1000, ignition: false },
    { ts: 2000, ignition: false },
  ];
  const { engineOnMs, engineOffMs } = computeEngineDurations(raw);
  assert.strictEqual(engineOnMs, 1000);
  assert.strictEqual(engineOffMs, 1000);
  console.log('ok engineDurations');
}

testEmpty();
testEngineOn();
testMoving();
testAggregate();
testEngineDurationsHelper();
console.log('metricsEngine tests passed');
