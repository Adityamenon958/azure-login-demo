/**
 * ✅ Lightweight journey helper checks — run with:
 *    node backend/tracker/__tests__/journeyService.test.js
 */
const assert = require('assert');
const {
  buildRawPoints,
  detectStops,
  computeDistance,
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

testStops();
console.log('✅ journey helper tests passed');
