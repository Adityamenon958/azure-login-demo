const assert = require('assert');
const { computeDueItems } = require('../analytics/maintenance');

function testEngineHoursDue() {
  const device = {
    totalEngineMs: 260 * 3600000,
    maintenanceSchedules: [
      {
        label: 'Oil Change',
        strategy: 'engineHours',
        intervalValue: 250,
        lastDoneEngineMs: 0,
        active: true,
      },
    ],
  };
  const items = computeDueItems(device);
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].severity, 'due');
  console.log('ok engineHours due');
}

function testDistanceSoon() {
  const device = {
    totalEngineMs: 0,
    maintenanceSchedules: [
      {
        label: 'Service',
        strategy: 'distanceKm',
        intervalValue: 5000,
        lastDoneOdometerKm: 0,
        active: true,
      },
    ],
  };
  const items = computeDueItems(device, { odometerEndKm: 4800 });
  assert.strictEqual(items[0].severity, 'soon');
  console.log('ok distance soon');
}

testEngineHoursDue();
testDistanceSoon();
console.log('maintenance tests passed');
