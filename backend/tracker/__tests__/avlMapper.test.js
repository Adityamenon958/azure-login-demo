/**
 * ✅ Lightweight mapper unit checks — run with:
 *    node backend/tracker/__tests__/avlMapper.test.js
 */
const assert = require('assert');
const { mapIoElements, mapAvlRecord } = require('../mappers/avlMapper');
const { deriveStatus } = require('../constants/trackerStatus');
const { maskImei, toStateDto } = require('../mappers/trackerDtoMapper');

function testMapIo() {
  const mapped = mapIoElements([
    { id: 239, value: 1, valueSize: 1 },
    { id: 240, value: 0, valueSize: 1 },
    { id: 66, value: 12000, valueSize: 2 },
    { id: 9999, value: 42, valueSize: 1 }, // unknown — dropped
  ]);
  assert.strictEqual(mapped.ignition, true);
  assert.strictEqual(mapped.movement, false);
  assert.strictEqual(mapped.externalVoltage, 12);
  assert.strictEqual(mapped.unknown, undefined);
}

function testStatus() {
  const now = new Date();
  assert.strictEqual(
    deriveStatus({ lastSeenAt: null, speed: 0 }, now),
    'offline'
  );
  assert.strictEqual(
    deriveStatus({ lastSeenAt: now, speed: 40, movement: false }, now),
    'moving'
  );
  assert.strictEqual(
    deriveStatus({ lastSeenAt: now, speed: 0, ignition: true }, now),
    'idle'
  );
}

function testDto() {
  assert.strictEqual(maskImei('123456789012345'), '***********2345');
  const state = toStateDto(
    { deviceId: 'T1', uid: 'U1', imei: '123456789012345' },
    {
      timestamp: new Date(),
      latitude: 18.5,
      longitude: 73.8,
      altitude: 10,
      angle: 90,
      satellites: 8,
      speed: 12,
      ioElements: [{ id: 239, value: 1, valueSize: 1 }],
    }
  );
  assert.ok(state.status === 'moving' || state.status === 'idle' || state.status === 'online');
  assert.strictEqual(state.ignition, true);
  assert.ok(!('ioElements' in state));
}

function testMapAvl() {
  const mapped = mapAvlRecord({
    timestamp: new Date(),
    latitude: 1,
    longitude: 2,
    altitude: 3,
    angle: 4,
    satellites: 5,
    speed: 6,
    imei: '1',
    device: 'x',
    ioElements: [],
  });
  assert.strictEqual(mapped.speed, 6);
  assert.strictEqual(mapped.heading, 4);
}

testMapIo();
testStatus();
testDto();
testMapAvl();
console.log('✅ tracker mapper/status tests passed');
