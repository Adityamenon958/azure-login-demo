/**
 * After a raw AvlRecord is saved: update Device last-live + incremental today stats.
 * Per-device queue serializes stats updates on this process; Mongo optimistic lock
 * covers multi-instance races.
 */
const Device = require('../../models/Device');
const { deriveStatus } = require('../constants/trackerStatus');
const { mapAvlRecord } = require('../mappers/avlMapper');
const { isValidCoordinates } = require('../utils/geo');
const { applyAvlToDayStat } = require('../analytics/dayStatStore');

const tails = new Map();

function enqueue(key, task) {
  const prev = tails.get(key) || Promise.resolve();
  const next = prev
    .catch((err) => {
      console.error('[tracker-ingest] previous task failed', err?.message || err);
    })
    .then(() => task());
  const cleaned = next
    .catch((err) => {
      console.error('[tracker-ingest]', key, err?.message || err);
    })
    .finally(() => {
      if (tails.get(key) === cleaned) tails.delete(key);
    });
  tails.set(key, cleaned);
  return cleaned;
}

/**
 * Build the AVL-shaped stub live-locations used to expect, from Device last-live fields.
 */
function avlStubFromDeviceLive(device) {
  if (!device?.lastLiveAt) return null;
  if (!isValidCoordinates(device.lastLatitude, device.lastLongitude)) return null;
  return {
    timestamp: device.lastLiveAt,
    latitude: device.lastLatitude,
    longitude: device.lastLongitude,
    speed: device.lastSpeed ?? 0,
    angle: device.lastHeading ?? 0,
    altitude: 0,
    satellites: 0,
    ioElements: [
      { id: 239, value: device.lastIgnition ? 1 : 0 },
      { id: 240, value: device.lastMovement ? 1 : 0 },
    ],
  };
}

async function updateDeviceLastLive(deviceObjectId, avlDoc) {
  const mapped = mapAvlRecord(avlDoc);
  const ts = mapped?.timestamp ? new Date(mapped.timestamp) : null;
  if (!ts || Number.isNaN(ts.getTime())) return;
  if (!isValidCoordinates(mapped.latitude, mapped.longitude)) return;

  const status = deriveStatus(
    {
      lastSeenAt: ts,
      speed: mapped.speed,
      ignition: mapped.ignition,
      movement: mapped.movement,
    },
    new Date()
  );

  await Device.updateOne(
    {
      _id: deviceObjectId,
      $or: [{ lastLiveAt: null }, { lastLiveAt: { $exists: false } }, { lastLiveAt: { $lte: ts } }],
    },
    {
      $set: {
        lastLiveAt: ts,
        lastLatitude: Number(mapped.latitude),
        lastLongitude: Number(mapped.longitude),
        lastSpeed: Number(mapped.speed) || 0,
        lastHeading: mapped.heading ?? 0,
        lastIgnition: mapped.ignition === true,
        lastMovement: mapped.movement === true,
        lastStatus: status,
      },
    }
  );
}

/**
 * Call after AvlRecord.create / insert. Does not throw to the ingest caller —
 * AVL is already persisted. Errors are logged. Awaited so updates are not lost.
 */
async function afterAvlPersisted(avlDoc, device) {
  if (!avlDoc || !device?._id) return;
  const id = String(device._id);
  await updateDeviceLastLive(device._id, avlDoc).catch((err) => {
    console.error('[tracker-ingest] last-live failed', device.deviceId, err?.message || err);
  });
  await enqueue(id, () => applyAvlToDayStat(device, avlDoc));
}

module.exports = {
  afterAvlPersisted,
  updateDeviceLastLive,
  avlStubFromDeviceLive,
  enqueue,
};
