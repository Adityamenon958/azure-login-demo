/**
 * After a raw AvlRecord is saved: update Device last-live + incremental today stats.
 * Per-device queue serializes stats updates on this process; Mongo optimistic lock
 * covers multi-instance races.
 */
const Device = require('../../models/Device');
const { deriveStatus } = require('../constants/trackerStatus');
const { mapAvlRecord } = require('../mappers/avlMapper');
const { isValidCoordinates } = require('../utils/geo');
const avlRecordRepository = require('../repositories/avlRecordRepository');
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

/** If last-live is missing or older than this, re-read the indexed latest AVL ping. */
const LAST_LIVE_STALE_MS = 2 * 60 * 1000;

function applyLatestAvlOntoDevice(device, avlDoc) {
  const mapped = mapAvlRecord(avlDoc);
  if (!mapped?.timestamp || !isValidCoordinates(mapped.latitude, mapped.longitude)) {
    return device;
  }
  device.lastLiveAt = mapped.timestamp;
  device.lastLatitude = Number(mapped.latitude);
  device.lastLongitude = Number(mapped.longitude);
  device.lastSpeed = Number(mapped.speed) || 0;
  device.lastHeading = mapped.heading ?? 0;
  device.lastIgnition = mapped.ignition === true;
  device.lastMovement = mapped.movement === true;
  return device;
}

function isLastLiveStale(device, now = new Date()) {
  if (!device?.lastLiveAt) return true;
  const age = now.getTime() - new Date(device.lastLiveAt).getTime();
  return !Number.isFinite(age) || age > LAST_LIVE_STALE_MS;
}

/**
 * When ingest missed a ping, Device.lastLiveAt goes stale while avlrecords is newer.
 * Only those stale devices do an indexed findOne (not a collection-wide aggregate).
 */
async function hydrateStaleDeviceLive(devices, now = new Date()) {
  const list = devices || [];
  const stale = list.filter((d) => isLastLiveStale(d, now));
  if (!stale.length) return list;

  await Promise.all(
    stale.map(async (device) => {
      const latest = await avlRecordRepository.findLatestByDeviceId(device._id);
      if (!latest?.timestamp) return;
      const latestTs = new Date(latest.timestamp);
      if (device.lastLiveAt && latestTs <= new Date(device.lastLiveAt)) return;
      await updateDeviceLastLive(device._id, latest).catch((err) => {
        console.error('[tracker-ingest] stale last-live sync failed', device.deviceId, err?.message || err);
      });
      applyLatestAvlOntoDevice(device, latest);
    })
  );
  return list;
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
  hydrateStaleDeviceLive,
  LAST_LIVE_STALE_MS,
  enqueue,
};
