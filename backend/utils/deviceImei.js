// ✅ Shared IMEI helpers for Fleet Tracker (Teltonika gpsTracker) device registration
const IMEI_REGEX = /^\d{15,16}$/;

function normalizeImei(value) {
  if (value == null) return undefined;
  const s = String(value).trim();
  return s === '' ? undefined : s;
}

function isGpsTrackerType(deviceType) {
  return String(deviceType || '').toLowerCase() === 'gpstracker';
}

/**
 * Validate IMEI against device type rules.
 * - gpsTracker (Fleet Tracker): required, 15–16 digits
 * - other types: IMEI not required (returned as undefined / clear)
 */
function validateImeiForDeviceType(deviceType, imeiRaw) {
  const imei = normalizeImei(imeiRaw);

  if (isGpsTrackerType(deviceType)) {
    if (!imei) {
      return { ok: false, message: 'IMEI is required for Fleet Tracker devices' };
    }
    if (!IMEI_REGEX.test(imei)) {
      return { ok: false, message: 'IMEI must be 15 or 16 digits (numbers only)' };
    }
    return { ok: true, imei, clearImei: false };
  }

  return { ok: true, imei: undefined, clearImei: true };
}

function isImeiDuplicateKeyError(err) {
  if (!err) return false;
  if (err.code !== 11000) return false;
  const key = err.keyPattern || {};
  const msg = String(err.message || '');
  return Boolean(key.imei) || msg.includes('imei');
}

module.exports = {
  IMEI_REGEX,
  normalizeImei,
  isGpsTrackerType,
  validateImeiForDeviceType,
  isImeiDuplicateKeyError,
};
