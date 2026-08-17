const deviceRepository = require('../repositories/deviceRepository');
const avlRecordRepository = require('../repositories/avlRecordRepository');
const { toLiveLocationDto } = require('../mappers/trackerDtoMapper');
const { avlStubFromDeviceLive } = require('./trackerIngestService');
const { validationError } = require('../utils/apiResponse');

function liveAvlForDevice(device, latestByMissingId) {
  const fromDevice = avlStubFromDeviceLive(device);
  if (fromDevice) return fromDevice;
  if (!latestByMissingId) return null;
  return latestByMissingId.get(String(device._id)) || null;
}

async function latestFallbackMap(devices) {
  const missing = (devices || []).filter((d) => !d.lastLiveAt);
  if (!missing.length) return null;
  const latestDocs = await avlRecordRepository.findLatestByDeviceIds(
    missing.map((d) => d._id)
  );
  return new Map(latestDocs.map((doc) => [String(doc.device), doc]));
}

async function getLiveLocations({
  role,
  companyName,
  companyNameFilter,
  includeReal = true,
  includeDemo = true,
}) {
  const devices = await deviceRepository.findGpsTrackers({
    role,
    companyName,
    companyNameFilter,
    includeReal,
    includeDemo,
  });

  const fallback = await latestFallbackMap(devices);
  const now = new Date();
  const locations = devices.map((device) =>
    toLiveLocationDto(device, liveAvlForDevice(device, fallback), now)
  );

  return { locations };
}

async function getLocationsInBounds({
  role,
  companyName,
  companyNameFilter,
  includeReal = true,
  includeDemo = true,
  north,
  south,
  east,
  west,
}) {
  const nums = [north, south, east, west].map(Number);
  if (nums.some((n) => !Number.isFinite(n))) {
    throw validationError('north, south, east, west must be valid numbers', {
      fields: ['north', 'south', 'east', 'west'],
    });
  }

  const [n, s, e, w] = nums;
  const devices = await deviceRepository.findGpsTrackers({
    role,
    companyName,
    companyNameFilter,
    includeReal,
    includeDemo,
  });

  const fallback = await latestFallbackMap(devices);
  const now = new Date();
  const locations = [];
  for (const device of devices) {
    const avl = liveAvlForDevice(device, fallback);
    if (!avl) continue;
    const lat = avl.latitude;
    const lon = avl.longitude;
    if (lat <= n && lat >= s && lon <= e && lon >= w) {
      locations.push(toLiveLocationDto(device, avl, now));
    }
  }

  return { locations };
}

module.exports = {
  getLiveLocations,
  getLocationsInBounds,
};
