const IO = require('../../tracker/constants/ioElementIds');

/**
 * Build Codec-8-compatible AvlRecord plain object (not yet saved).
 */
function buildAvlRecordDoc({
  deviceObjectId,
  imei,
  timestamp,
  lat,
  lon,
  speedKmh,
  heading,
  ignition,
  movement,
  odometerMeters,
}) {
  const speed = Math.max(0, Math.round(Number(speedKmh) || 0));
  const angle = Math.round(((Number(heading) || 0) % 360) + 360) % 360;
  const odo = Math.max(0, Math.round(Number(odometerMeters) || 0));

  return {
    device: deviceObjectId,
    imei: String(imei),
    codecId: 8,
    priority: 0,
    timestamp: timestamp instanceof Date ? timestamp : new Date(timestamp),
    longitude: Number(lon),
    latitude: Number(lat),
    altitude: 12,
    angle,
    satellites: 8 + Math.floor(Math.random() * 6),
    speed,
    eventIoId: 0,
    ioElements: [
      { id: IO.IGNITION, value: ignition ? 1 : 0, valueSize: 1 },
      { id: IO.MOVEMENT, value: movement ? 1 : 0, valueSize: 1 },
      { id: IO.TOTAL_ODOMETER, value: odo, valueSize: 4 },
      { id: IO.EXTERNAL_VOLTAGE, value: 13800 + Math.floor(Math.random() * 200), valueSize: 2 },
      { id: IO.BATTERY_VOLTAGE, value: 4000 + Math.floor(Math.random() * 100), valueSize: 2 },
      { id: IO.GSM_SIGNAL, value: 3 + Math.floor(Math.random() * 2), valueSize: 1 },
      { id: IO.GNSS_STATUS, value: 1, valueSize: 1 },
    ],
    crcValid: true,
    receivedAt: new Date(),
  };
}

module.exports = { buildAvlRecordDoc };
