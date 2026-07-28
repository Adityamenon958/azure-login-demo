const deviceRepository = require('../repositories/deviceRepository');
const avlRecordRepository = require('../repositories/avlRecordRepository');
const {
  toDeviceListItemDto,
  toDeviceDetailDto,
} = require('../mappers/trackerDtoMapper');
const { notFound, validationError } = require('../utils/apiResponse');
const { parsePage, parseLimit } = require('../utils/timeRange');

async function listDevices({
  role,
  companyName,
  companyNameFilter,
  page,
  limit,
  search,
  status,
}) {
  const pageNum = parsePage(page, 1);
  const limitNum = parseLimit(limit, 50, 200);

  let devices = await deviceRepository.findGpsTrackers({
    role,
    companyName,
    companyNameFilter,
  });

  if (search && String(search).trim()) {
    const q = String(search).trim().toLowerCase();
    devices = devices.filter(
      (d) =>
        String(d.deviceId || '').toLowerCase().includes(q) ||
        String(d.uid || '').toLowerCase().includes(q) ||
        String(d.displayName || '').toLowerCase().includes(q) ||
        String(d.deviceModel || '').toLowerCase().includes(q) ||
        String(d.imei || '').toLowerCase().includes(q)
    );
  }

  const latestDocs = await avlRecordRepository.findLatestByDeviceIds(
    devices.map((d) => d._id)
  );
  const latestByDeviceId = new Map(
    latestDocs.map((doc) => [String(doc.device), doc])
  );

  const now = new Date();
  let items = devices.map((device) =>
    toDeviceListItemDto(device, latestByDeviceId.get(String(device._id)) || null, now)
  );

  if (status && String(status).trim() && String(status) !== 'all') {
    let st = String(status).trim();
    // ✅ Legacy aliases from older UI
    if (st === 'online') st = 'parked';
    if (st === 'offline') st = 'needsAttention';
    const allowed = new Set(['moving', 'idle', 'parked', 'needsAttention']);
    if (!allowed.has(st)) {
      throw validationError('status must be moving|idle|parked|needsAttention|all', {
        field: 'status',
      });
    }
    items = items.filter((i) => i.status === st);
  }

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limitNum) || 1);
  const start = (pageNum - 1) * limitNum;
  const pageItems = items.slice(start, start + limitNum);

  return {
    items: pageItems,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages,
    },
  };
}

async function getDeviceById({ role, companyName, deviceId, companyNameFilter }) {
  if (!deviceId) {
    throw validationError('device id is required', { field: 'id' });
  }

  const device = await deviceRepository.findGpsTrackerByDeviceId({
    role,
    companyName,
    deviceId,
    companyNameFilter,
  });

  if (!device) {
    throw notFound('Device not found');
  }

  const latest = await avlRecordRepository.findLatestByDeviceId(device._id);
  return toDeviceDetailDto(device, latest, new Date());
}

module.exports = {
  listDevices,
  getDeviceById,
};
