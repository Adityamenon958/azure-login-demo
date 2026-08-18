/**
 * ✅ Lightweight journey helper checks — run with:
 *    node backend/tracker/__tests__/journeyService.test.js
 */
const assert = require('assert');
const {
  buildRawPoints,
  detectStops,
  computeDistance,
  parseInclude,
  strideSampleDocs,
  mapTotalsToTripSummary,
} = require('../services/trackerJourneyService');

function testStops() {
  const now = Date.now();
  const docs = [];
  // moving then parked 5 minutes
  for (let i = 0; i < 5; i += 1) {
    docs.push({
      timestamp: new Date(now + i * 60000),
      latitude: 18.5,
      longitude: 73.8,
      speed: 40,
      angle: 90,
      satellites: 8,
      ioElements: [
        { id: 239, value: 1 },
        { id: 240, value: 1 },
      ],
    });
  }
  for (let i = 0; i < 6; i += 1) {
    docs.push({
      timestamp: new Date(now + (5 + i) * 60000),
      latitude: 18.5001,
      longitude: 73.8001,
      speed: 0,
      angle: 90,
      satellites: 8,
      ioElements: [
        { id: 239, value: 0 },
        { id: 240, value: 0 },
      ],
    });
  }

  const raw = buildRawPoints(docs);
  assert.ok(raw.length >= 10);
  const stops = detectStops(raw);
  assert.ok(stops.length >= 1);
  assert.strictEqual(stops[0].kind, 'parked');
  assert.ok(stops[0].id.startsWith('stop-'));
  const dist = computeDistance(raw);
  assert.ok(dist.distanceM >= 0);
  assert.ok(dist.distanceSource === 'haversine' || dist.distanceSource === 'odometer');
}

function testIncludeAndSample() {
  const all = parseInclude();
  assert.strictEqual(all.path, true);
  assert.strictEqual(all.timeline, true);
  const light = parseInclude('path,stops');
  assert.strictEqual(light.path, true);
  assert.strictEqual(light.stops, true);
  assert.strictEqual(light.timeline, false);
  const docs = Array.from({ length: 10 }, (_, i) => i);
  const sampled = strideSampleDocs(docs, 4);
  assert.ok(sampled.length <= 5);
  assert.strictEqual(sampled[sampled.length - 1], 9);
  const summary = mapTotalsToTripSummary({
    movingMs: 3600000,
    idleMs: 600000,
    parkedMs: 1200000,
    distanceKm: 40,
    tripCount: 3,
    maxSpeedKmh: 72.2,
    distanceSource: 'haversine',
  });
  assert.strictEqual(summary.drivingMs, 3600000);
  assert.strictEqual(summary.avgSpeedKmh, 40);
  assert.strictEqual(summary.source, 'trackerstat');
}

testStops();
testIncludeAndSample();
console.log('✅ journey helper tests passed');
