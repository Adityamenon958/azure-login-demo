const Device = require('../../models/Device');

/**
 * Mongo queries for GPS Tracker devices (allowlist).
 */
async function findGpsTrackers({ role, companyName, companyNameFilter }) {
  const query = { deviceType: 'gpsTracker' };

  if (role !== 'superadmin') {
    query.companyName = companyName;
  } else if (companyNameFilter) {
    query.companyName = companyNameFilter;
  }

  return Device.find(query).lean();
}

/**
 * Find one gpsTracker by business deviceId within allowlist scope.
 */
async function findGpsTrackerByDeviceId({ role, companyName, deviceId, companyNameFilter }) {
  const query = {
    deviceType: 'gpsTracker',
    deviceId: String(deviceId),
  };

  if (role !== 'superadmin') {
    query.companyName = companyName;
  } else if (companyNameFilter) {
    query.companyName = companyNameFilter;
  }

  return Device.findOne(query).lean();
}

module.exports = {
  findGpsTrackers,
  findGpsTrackerByDeviceId,
};
