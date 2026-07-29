const mongoose = require('mongoose');
const AvlRecord = require('../../models/AvlRecord');

/**
 * Latest AVL document per device ObjectId (indexed sort + group).
 * @param {Array<import('mongoose').Types.ObjectId|string>} deviceObjectIds
 */
async function findLatestByDeviceIds(deviceObjectIds) {
  if (!deviceObjectIds || deviceObjectIds.length === 0) {
    return [];
  }

  const ids = deviceObjectIds.map((id) =>
    id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(id)
  );

  return AvlRecord.aggregate([
    { $match: { device: { $in: ids } } },
    { $sort: { timestamp: -1 } },
    {
      $group: {
        _id: '$device',
        doc: { $first: '$$ROOT' },
      },
    },
    {
      $replaceRoot: { newRoot: '$doc' },
    },
  ]);
}

/**
 * Latest AVL for a single device ObjectId.
 */
async function findLatestByDeviceId(deviceObjectId) {
  const id =
    deviceObjectId instanceof mongoose.Types.ObjectId
      ? deviceObjectId
      : new mongoose.Types.ObjectId(deviceObjectId);

  return AvlRecord.findOne({ device: id }).sort({ timestamp: -1 }).lean();
}

/**
 * Time-bounded history for one device.
 */
async function findHistoryByDeviceId({
  deviceObjectId,
  from,
  to,
  limit = 500,
  cursorTimestamp,
}) {
  const id =
    deviceObjectId instanceof mongoose.Types.ObjectId
      ? deviceObjectId
      : new mongoose.Types.ObjectId(deviceObjectId);

  const query = {
    device: id,
    timestamp: cursorTimestamp
      ? { $gte: from, $lt: new Date(cursorTimestamp) }
      : { $gte: from, $lte: to },
  };

  const points = await AvlRecord.find(query)
    .sort({ timestamp: -1 })
    .limit(limit + 1)
    .select({
      timestamp: 1,
      latitude: 1,
      longitude: 1,
      speed: 1,
      angle: 1,
      ioElements: 1,
    })
    .lean();

  let nextCursor = null;
  let result = points;
  if (points.length > limit) {
    result = points.slice(0, limit);
    const last = result[result.length - 1];
    nextCursor = last?.timestamp ? new Date(last.timestamp).toISOString() : null;
  }

  return { points: result, nextCursor };
}

/**
 * Recent AVL docs across many devices (for activity feed).
 */
async function findRecentByDeviceIds({ deviceObjectIds, limit = 20 }) {
  if (!deviceObjectIds || deviceObjectIds.length === 0) {
    return [];
  }

  const ids = deviceObjectIds.map((id) =>
    id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(id)
  );

  return AvlRecord.find({ device: { $in: ids } })
    .sort({ timestamp: -1 })
    .limit(limit)
    .select({
      device: 1,
      timestamp: 1,
      latitude: 1,
      longitude: 1,
      speed: 1,
      angle: 1,
      ioElements: 1,
    })
    .lean();
}

/**
 * History points for statistics bucketing (ascending).
 */
async function findHistoryAscForStats({ deviceObjectId, from, to }) {
  const id =
    deviceObjectId instanceof mongoose.Types.ObjectId
      ? deviceObjectId
      : new mongoose.Types.ObjectId(deviceObjectId);

  return AvlRecord.find({
    device: id,
    timestamp: { $gte: from, $lte: to },
  })
    .sort({ timestamp: 1 })
    .select({
      timestamp: 1,
      speed: 1,
      ioElements: 1,
    })
    .lean();
}

/**
 * History points for journey / route (ascending, includes coordinates).
 */
async function findHistoryAscForJourney({ deviceObjectId, from, to }) {
  const id =
    deviceObjectId instanceof mongoose.Types.ObjectId
      ? deviceObjectId
      : new mongoose.Types.ObjectId(deviceObjectId);

  return AvlRecord.find({
    device: id,
    timestamp: { $gte: from, $lte: to },
  })
    .sort({ timestamp: 1 })
    .select({
      timestamp: 1,
      latitude: 1,
      longitude: 1,
      altitude: 1,
      speed: 1,
      angle: 1,
      satellites: 1,
      ioElements: 1,
    })
    .lean();
}

/**
 * Latest AVL markers within a geographic bounding box (optional map endpoint).
 */
async function findLatestInBounds({ deviceObjectIds, north, south, east, west }) {
  const latest = await findLatestByDeviceIds(deviceObjectIds);
  return latest.filter((doc) => {
    const lat = doc.latitude;
    const lon = doc.longitude;
    return lat <= north && lat >= south && lon <= east && lon >= west;
  });
}

module.exports = {
  findLatestByDeviceIds,
  findLatestByDeviceId,
  findHistoryByDeviceId,
  findRecentByDeviceIds,
  findHistoryAscForStats,
  findHistoryAscForJourney,
  findLatestInBounds,
};
