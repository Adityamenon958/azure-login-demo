const deviceRepository = require('../repositories/deviceRepository');
const avlRecordRepository = require('../repositories/avlRecordRepository');
const { mapAvlRecord } = require('../mappers/avlMapper');
const { deriveStatus } = require('../constants/trackerStatus');
const { parseLimit } = require('../utils/timeRange');
const { notFound } = require('../utils/apiResponse');

/**
 * ✅ Prefer derived operational status (moving|idle|parked|needsAttention).
 * Ignition alone must not become a separate type that the UI maps to Parked.
 */
function eventTypeFromMapped(_mapped, status) {
  if (status === 'needsAttention') return 'needsAttention';
  if (status === 'moving') return 'moving';
  if (status === 'idle') return 'idle';
  return 'parked';
}

function summaryFor(type, speed) {
  switch (type) {
    case 'moving':
      return `Moving at ${Math.round(speed || 0)} km/h`;
    case 'idle':
      return 'Ignition on';
    case 'needsAttention':
      return 'No recent signal';
    case 'parked':
      return 'Ignition off';
    default:
      return 'Parked / at rest';
  }
}

/**
 * Recent activity events for fleet or one device.
 */
async function getActivity({
  role,
  companyName,
  companyNameFilter,
  deviceId,
  limit,
}) {
  const limitNum = parseLimit(limit, 20, 100);
  let devices = await deviceRepository.findGpsTrackers({
    role,
    companyName,
    companyNameFilter,
  });

  if (deviceId) {
    devices = devices.filter((d) => d.deviceId === String(deviceId));
    if (devices.length === 0) {
      throw notFound('Device not found');
    }
  }

  const deviceByOid = new Map(devices.map((d) => [String(d._id), d]));
  const docs = await avlRecordRepository.findRecentByDeviceIds({
    deviceObjectIds: devices.map((d) => d._id),
    limit: limitNum,
  });

  const now = new Date();
  const events = [];

  for (const doc of docs) {
    const device = deviceByOid.get(String(doc.device));
    if (!device) continue;
    const mapped = mapAvlRecord(doc);
    const status = deriveStatus(
      {
        lastSeenAt: mapped?.timestamp,
        speed: mapped?.speed,
        ignition: mapped?.ignition,
        movement: mapped?.movement,
      },
      now
    );
    const type = eventTypeFromMapped(mapped, status);
    events.push({
      deviceId: device.deviceId,
      uid: device.uid,
      displayName: (device.displayName && String(device.displayName).trim()) || device.deviceId,
      deviceModel: device.deviceModel || null,
      timestamp: mapped?.timestamp
        ? new Date(mapped.timestamp).toISOString()
        : null,
      type,
      summary: summaryFor(type, mapped?.speed),
      latitude: mapped?.latitude ?? 0,
      longitude: mapped?.longitude ?? 0,
      speed: mapped?.speed ?? 0,
    });
  }

  return { events };
}

module.exports = { getActivity };
