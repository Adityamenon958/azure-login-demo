/**
 * ✅ Device capability profiles — page shell stays stable; richer models unlock slots.
 * FMB125 entries are stubs until CAN/IO mapping ships.
 */

const BASE_LIVE = [
  'speed',
  'ignition',
  'movement',
  'gps',
  'satellites',
  'battery',
  'heading',
  'altitude',
  'externalVoltage',
  'gsmSignal',
];

const BASE_CHARTS = ['speed', 'activity', 'battery'];
const BASE_EVENTS = ['ignition', 'driving', 'gps', 'stop', 'health'];
const BASE_HEALTH = ['gsmSignal', 'gnssStatus', 'sleepMode', 'pdop', 'hdop', 'battery', 'externalVoltage'];

export const DEVICE_CAPABILITIES = {
  FMB920: {
    live: BASE_LIVE,
    charts: BASE_CHARTS,
    events: BASE_EVENTS,
    health: BASE_HEALTH,
    distance: ['odometer', 'haversine'],
    alerts: false,
    geofence: false,
  },
  FMB125: {
    live: [...BASE_LIVE, 'rpm', 'fuelLevel', 'engineHours'],
    charts: [...BASE_CHARTS, 'rpm', 'fuel'],
    events: [...BASE_EVENTS, 'alert'],
    health: BASE_HEALTH,
    distance: ['odometer', 'haversine'],
    alerts: true,
    geofence: false,
  },
  default: {
    live: BASE_LIVE,
    charts: BASE_CHARTS,
    events: BASE_EVENTS,
    health: BASE_HEALTH,
    distance: ['haversine'],
    alerts: false,
    geofence: false,
  },
};

export function getDeviceCapabilities(deviceModel) {
  if (deviceModel && DEVICE_CAPABILITIES[deviceModel]) {
    return DEVICE_CAPABILITIES[deviceModel];
  }
  return DEVICE_CAPABILITIES.default;
}

export function hasCapability(deviceModel, slot, key) {
  const caps = getDeviceCapabilities(deviceModel);
  const list = caps[slot];
  if (Array.isArray(list)) return list.includes(key);
  return Boolean(caps[slot]);
}
