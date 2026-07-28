const deviceRepository = require('../repositories/deviceRepository');
const avlRecordRepository = require('../repositories/avlRecordRepository');
const { toLiveLocationDto } = require('../mappers/trackerDtoMapper');
const { validationError } = require('../utils/apiResponse');

async function getLiveLocations({ role, companyName, companyNameFilter }) {
  const devices = await deviceRepository.findGpsTrackers({
    role,
    companyName,
    companyNameFilter,
  });

  const latestDocs = await avlRecordRepository.findLatestByDeviceIds(
    devices.map((d) => d._id)
  );
  const latestByDeviceId = new Map(
    latestDocs.map((doc) => [String(doc.device), doc])
  );

  const now = new Date();
  const locations = devices.map((device) =>
    toLiveLocationDto(device, latestByDeviceId.get(String(device._id)) || null, now)
  );

  return { locations };
}

async function getLocationsInBounds({
  role,
  companyName,
  companyNameFilter,
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
  });

  const latestDocs = await avlRecordRepository.findLatestInBounds({
    deviceObjectIds: devices.map((d) => d._id),
    north: n,
    south: s,
    east: e,
    west: w,
  });

  const latestByDeviceId = new Map(
    latestDocs.map((doc) => [String(doc.device), doc])
  );

  const deviceByOid = new Map(devices.map((d) => [String(d._id), d]));
  const now = new Date();

  const locations = [];
  for (const [oid, doc] of latestByDeviceId.entries()) {
    const device = deviceByOid.get(oid);
    if (device) {
      locations.push(toLiveLocationDto(device, doc, now));
    }
  }

  return { locations };
}

module.exports = {
  getLiveLocations,
  getLocationsInBounds,
};
