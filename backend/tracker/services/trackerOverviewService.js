const deviceRepository = require('../repositories/deviceRepository');
const avlRecordRepository = require('../repositories/avlRecordRepository');
const {
  toOverviewDeviceDto,
} = require('../mappers/trackerDtoMapper');

/**
 * Build overview KPIs + slim device list.
 */
async function getOverview({ role, companyName, companyNameFilter }) {
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
  const list = devices.map((device) =>
    toOverviewDeviceDto(device, latestByDeviceId.get(String(device._id)) || null, now)
  );

  const kpis = {
    total: list.length,
    online: 0,
    moving: 0,
    idle: 0,
    offline: 0,
  };

  for (const item of list) {
    if (item.status === 'moving') kpis.moving += 1;
    else if (item.status === 'idle') kpis.idle += 1;
    else if (item.status === 'offline') kpis.offline += 1;
    else if (item.status === 'online') kpis.online += 1;
  }

  return { kpis, devices: list };
}

module.exports = { getOverview };
