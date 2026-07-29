const { deriveStatus } = require('../constants/trackerStatus');
const { mapAvlRecord } = require('./avlMapper');

/**
 * Mask IMEI — show last 4 digits only.
 * @param {string|null|undefined} imei
 */
function maskImei(imei) {
  if (!imei || typeof imei !== 'string') return '';
  const trimmed = imei.trim();
  if (trimmed.length <= 4) return '*'.repeat(trimmed.length);
  return `${'*'.repeat(Math.max(0, trimmed.length - 4))}${trimmed.slice(-4)}`;
}

/** Primary human label: displayName with deviceId fallback */
function primaryLabel(device) {
  const name = device?.displayName && String(device.displayName).trim();
  return name || device?.deviceId || '';
}

/**
 * Build public state DTO from device + latest AVL (mapped).
 * Never includes ioElements or raw AVL IDs.
 */
function toStateDto(device, avlDoc, now = new Date()) {
  const mapped = mapAvlRecord(avlDoc);
  const lastSeenAt = mapped?.timestamp || null;
  const status = deriveStatus(
    {
      lastSeenAt,
      speed: mapped?.speed,
      ignition: mapped?.ignition,
      movement: mapped?.movement,
    },
    now
  );

  if (!mapped) {
    return {
      status: 'needsAttention',
      latitude: null,
      longitude: null,
      altitude: null,
      speed: null,
      heading: null,
      satellites: null,
      ignition: false,
      movement: false,
      batteryVoltage: null,
      externalVoltage: null,
      gsmSignal: null,
      gnssStatus: null,
      gnssStatusLabel: null,
      gsmSignalLabel: null,
      sleepMode: false,
      pdop: null,
      hdop: null,
      totalOdometer: null,
      tripOdometer: null,
      lastSeenAt: null,
    };
  }

  const gnssStatus = mapped.gnssStatus ?? null;
  // ✅ Teltonika IO 69 — never expose raw codes to clients as the label
  let gnssStatusLabel = null;
  if (gnssStatus === 0) gnssStatusLabel = 'GPS Off';
  else if (gnssStatus === 1) gnssStatusLabel = 'GPS Locked';
  else if (gnssStatus === 2) gnssStatusLabel = 'Searching…';
  else if (gnssStatus === 3) gnssStatusLabel = 'GPS Sleep';
  else if (gnssStatus === 4) gnssStatusLabel = 'GPS Locked';
  else if (gnssStatus != null) gnssStatusLabel = 'No GPS Fix';
  else if (
    Number.isFinite(Number(mapped.latitude)) &&
    Number.isFinite(Number(mapped.longitude)) &&
    !(Number(mapped.latitude) === 0 && Number(mapped.longitude) === 0)
  ) {
    gnssStatusLabel = 'GPS Locked';
  }

  // ✅ Teltonika IO 21 — GSM signal scale 1–5
  const gsmSignal = mapped.gsmSignal;
  let gsmSignalLabel = null;
  if (gsmSignal == null || Number.isNaN(Number(gsmSignal))) {
    gsmSignalLabel = null;
  } else {
    const g = Math.round(Number(gsmSignal));
    if (g <= 0) gsmSignalLabel = 'No Signal';
    else if (g === 1) gsmSignalLabel = 'Weak';
    else if (g === 2) gsmSignalLabel = 'Fair';
    else if (g === 3 || g === 4) gsmSignalLabel = 'Good';
    else if (g >= 5) gsmSignalLabel = 'Excellent';
  }

  return {
    status,
    latitude: mapped.latitude ?? null,
    longitude: mapped.longitude ?? null,
    altitude: mapped.altitude ?? null,
    speed: mapped.speed ?? null,
    heading: mapped.heading ?? null,
    satellites: mapped.satellites ?? null,
    ignition: mapped.ignition === true,
    movement: mapped.movement === true,
    batteryVoltage: mapped.batteryVoltage,
    externalVoltage: mapped.externalVoltage,
    gsmSignal,
    gsmSignalLabel,
    gnssStatus,
    gnssStatusLabel,
    sleepMode: mapped.sleepMode === true,
    pdop: mapped.pdop,
    hdop: mapped.hdop,
    totalOdometer: mapped.totalOdometer,
    tripOdometer: mapped.tripOdometer,
    lastSeenAt: lastSeenAt ? new Date(lastSeenAt).toISOString() : null,
  };
}

function toOverviewDeviceDto(device, avlDoc, now = new Date()) {
  const state = toStateDto(device, avlDoc, now);
  return {
    deviceId: device.deviceId,
    uid: device.uid,
    displayName: primaryLabel(device),
    deviceModel: device.deviceModel || null,
    imeiMasked: maskImei(device.imei || avlDoc?.imei),
    status: state.status,
    speed: state.speed ?? 0,
    lastSeenAt: state.lastSeenAt,
    latitude: state.latitude ?? 0,
    longitude: state.longitude ?? 0,
  };
}

function toLiveLocationDto(device, avlDoc, now = new Date()) {
  const state = toStateDto(device, avlDoc, now);
  return {
    deviceId: device.deviceId,
    uid: device.uid,
    displayName: primaryLabel(device),
    deviceModel: device.deviceModel || null,
    latitude: state.latitude ?? 0,
    longitude: state.longitude ?? 0,
    status: state.status,
    speed: state.speed ?? 0,
    heading: state.heading ?? 0,
    lastSeenAt: state.lastSeenAt,
  };
}

function toDeviceListItemDto(device, avlDoc, now = new Date()) {
  const state = toStateDto(device, avlDoc, now);
  return {
    deviceId: device.deviceId,
    uid: device.uid,
    displayName: primaryLabel(device),
    deviceModel: device.deviceModel || null,
    companyName: device.companyName,
    imeiMasked: maskImei(device.imei || avlDoc?.imei),
    status: state.status,
    speed: state.speed ?? 0,
    lastSeenAt: state.lastSeenAt,
    latitude: state.latitude ?? 0,
    longitude: state.longitude ?? 0,
  };
}

function toDeviceDetailDto(device, avlDoc, now = new Date()) {
  return {
    device: {
      deviceId: device.deviceId,
      uid: device.uid,
      displayName: primaryLabel(device),
      deviceModel: device.deviceModel || null,
      companyName: device.companyName,
      imeiMasked: maskImei(device.imei),
      deviceType: device.deviceType,
    },
    state: toStateDto(device, avlDoc, now),
  };
}

function toHistoryPointDto(avlDoc) {
  const mapped = mapAvlRecord(avlDoc);
  if (!mapped) return null;
  return {
    timestamp: mapped.timestamp ? new Date(mapped.timestamp).toISOString() : null,
    latitude: mapped.latitude,
    longitude: mapped.longitude,
    speed: mapped.speed,
    heading: mapped.heading,
    ignition: mapped.ignition === true,
    movement: mapped.movement === true,
    batteryVoltage: mapped.batteryVoltage,
  };
}

module.exports = {
  maskImei,
  primaryLabel,
  toStateDto,
  toOverviewDeviceDto,
  toLiveLocationDto,
  toDeviceListItemDto,
  toDeviceDetailDto,
  toHistoryPointDto,
};
