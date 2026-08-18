const deviceRepository = require('../repositories/deviceRepository');
const { toLiveLocationDto } = require('../mappers/trackerDtoMapper');
const {
  avlStubFromDeviceLive,
  hydrateStaleDeviceLive,
} = require('./trackerIngestService');
const { validationError } = require('../utils/apiResponse');

function liveAvlForDevice(device) {
  return avlStubFromDeviceLive(device);
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

  await hydrateStaleDeviceLive(devices);

  const now = new Date();
  const locations = devices.map((device) =>
    toLiveLocationDto(device, liveAvlForDevice(device), now)
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

  await hydrateStaleDeviceLive(devices);

  const now = new Date();
  const locations = [];
  for (const device of devices) {
    const avl = liveAvlForDevice(device);
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
