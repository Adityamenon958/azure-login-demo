const deviceRepository = require('../repositories/deviceRepository');
const {
  avlStubFromDeviceLive,
  hydrateStaleDeviceLive,
} = require('./trackerIngestService');
const {
  toOverviewDeviceDto,
} = require('../mappers/trackerDtoMapper');

/**
 * Build overview KPIs + slim device list.
 */
async function getOverview({
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
  const list = devices.map((device) =>
    toOverviewDeviceDto(device, avlStubFromDeviceLive(device), now)
  );

  const kpis = {
    total: list.length,
    moving: 0,
    idle: 0,
    parked: 0,
    needsAttention: 0,
  };

  for (const item of list) {
    if (item.status === 'moving') kpis.moving += 1;
    else if (item.status === 'idle') kpis.idle += 1;
    else if (item.status === 'parked') kpis.parked += 1;
    else if (item.status === 'needsAttention') kpis.needsAttention += 1;
  }

  return { kpis, devices: list };
}

module.exports = { getOverview };
