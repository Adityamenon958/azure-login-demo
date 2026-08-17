const deviceRepository = require('../repositories/deviceRepository');
const avlRecordRepository = require('../repositories/avlRecordRepository');
const { avlStubFromDeviceLive } = require('./trackerIngestService');
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

  const missing = devices.filter((d) => !d.lastLiveAt);
  const latestDocs = missing.length
    ? await avlRecordRepository.findLatestByDeviceIds(missing.map((d) => d._id))
    : [];
  const latestByDeviceId = new Map(
    latestDocs.map((doc) => [String(doc.device), doc])
  );

  const now = new Date();
  const list = devices.map((device) =>
    toOverviewDeviceDto(
      device,
      avlStubFromDeviceLive(device) || latestByDeviceId.get(String(device._id)) || null,
      now
    )
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
