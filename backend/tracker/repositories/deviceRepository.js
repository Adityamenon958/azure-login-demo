const Device = require('../../models/Device');
const { buildDeviceDataOriginFilter } = require('../utils/dataSourceFilter');

/**
 * Mongo queries for GPS Tracker devices (allowlist).
 */
async function findGpsTrackers({
  role,
  companyName,
  companyNameFilter,
  includeReal = true,
  includeDemo = true,
}) {
  const query = { deviceType: 'gpsTracker' };

  if (role !== 'superadmin') {
    query.companyName = companyName;
  } else if (companyNameFilter) {
    query.companyName = companyNameFilter;
  }

  const originFilter = buildDeviceDataOriginFilter({ includeReal, includeDemo });
  if (originFilter) {
    Object.assign(query, originFilter);
  }

  return Device.find(query).lean();
}

/**
 * Find one gpsTracker by business deviceId within allowlist scope.
 */
async function findGpsTrackerByDeviceId({
  role,
  companyName,
  deviceId,
  companyNameFilter,
  includeReal = true,
  includeDemo = true,
}) {
  const query = {
    deviceType: 'gpsTracker',
    deviceId: String(deviceId),
  };

  if (role !== 'superadmin') {
    query.companyName = companyName;
  } else if (companyNameFilter) {
    query.companyName = companyNameFilter;
  }

  const originFilter = buildDeviceDataOriginFilter({ includeReal, includeDemo });
  if (originFilter) {
    Object.assign(query, originFilter);
  }

  return Device.findOne(query).lean();
}

module.exports = {
  findGpsTrackers,
  findGpsTrackerByDeviceId,
};
