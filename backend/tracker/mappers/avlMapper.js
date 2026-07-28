const IO = require('../constants/ioElementIds');

function toNumber(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toBool(value) {
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0') return false;
  const n = toNumber(value);
  if (n == null) return false;
  return n !== 0;
}

/**
 * Map raw AVL ioElements → named fields.
 * Unknown IDs are dropped (never exposed to API clients).
 *
 * @param {Array<{ id: number, value: any, valueSize?: number }>} ioElements
 */
function mapIoElements(ioElements = []) {
  const byId = new Map();
  for (const el of ioElements) {
    if (el && typeof el.id === 'number') {
      byId.set(el.id, el.value);
    }
  }

  const extMv = toNumber(byId.get(IO.EXTERNAL_VOLTAGE));
  const batMv = toNumber(byId.get(IO.BATTERY_VOLTAGE));

  return {
    ignition: byId.has(IO.IGNITION) ? toBool(byId.get(IO.IGNITION)) : false,
    movement: byId.has(IO.MOVEMENT) ? toBool(byId.get(IO.MOVEMENT)) : false,
    externalVoltage: extMv != null ? extMv / 1000 : null,
    batteryVoltage: batMv != null ? batMv / 1000 : null,
    gsmSignal: toNumber(byId.get(IO.GSM_SIGNAL)),
    gnssStatus: toNumber(byId.get(IO.GNSS_STATUS)),
    sleepMode: byId.has(IO.SLEEP_MODE) ? toBool(byId.get(IO.SLEEP_MODE)) : false,
    pdop: toNumber(byId.get(IO.PDOP)),
    hdop: toNumber(byId.get(IO.HDOP)),
    totalOdometer: toNumber(byId.get(IO.TOTAL_ODOMETER)),
    tripOdometer: toNumber(byId.get(IO.TRIP_ODOMETER)),
  };
}

/**
 * Merge GPS fields from AVL record with mapped IO.
 * @param {object} avlDoc lean AvlRecord
 */
function mapAvlRecord(avlDoc) {
  if (!avlDoc) return null;
  const io = mapIoElements(avlDoc.ioElements || []);
  return {
    timestamp: avlDoc.timestamp || null,
    latitude: avlDoc.latitude,
    longitude: avlDoc.longitude,
    altitude: avlDoc.altitude,
    heading: avlDoc.angle,
    satellites: avlDoc.satellites,
    speed: avlDoc.speed,
    imei: avlDoc.imei,
    deviceObjectId: avlDoc.device,
    ...io,
  };
}

module.exports = {
  mapIoElements,
  mapAvlRecord,
};
