/**
 * ✅ Device category → model catalog (V1 code config).
 * Categories rarely change; models are allowlisted per category.
 * Keep in sync with frontend/src/constants/deviceCatalog.js
 */

const { isGpsTrackerType } = require('./deviceImei');

/** UI labels for deviceType values */
const DEVICE_TYPE_OPTIONS = [
  { value: 'levelSensor', label: 'Level Sensor' },
  { value: 'crane', label: 'Crane' },
  { value: 'elevator', label: 'Elevator' },
  { value: 'energyMeter', label: 'Energy Meter' },
  { value: 'gpsTracker', label: 'Fleet Tracker' },
];

/** Models allowed per deviceType (empty = no model field) */
const MODELS_BY_CATEGORY = {
  gpsTracker: ['FMB920', 'FMB125'],
  energyMeter: [],
  levelSensor: [],
  crane: [],
  elevator: [],
};

function getModelsForCategory(deviceType) {
  const key = String(deviceType || '');
  const list = MODELS_BY_CATEGORY[key];
  return Array.isArray(list) ? [...list] : [];
}

function isModelAllowed(deviceType, deviceModel) {
  const models = getModelsForCategory(deviceType);
  if (models.length === 0) return !deviceModel;
  return models.includes(String(deviceModel || '').trim());
}

/**
 * Validate deviceModel for category.
 * - Fleet Tracker (gpsTracker): required, must be in allowlist
 * - Other types: model cleared
 */
function validateDeviceModelForType(deviceType, deviceModelRaw) {
  const model = deviceModelRaw == null ? '' : String(deviceModelRaw).trim();

  if (isGpsTrackerType(deviceType)) {
    if (!model) {
      return { ok: false, message: 'Device Model is required for Fleet Tracker devices' };
    }
    if (!isModelAllowed(deviceType, model)) {
      return {
        ok: false,
        message: `Device Model must be one of: ${getModelsForCategory(deviceType).join(', ')}`,
      };
    }
    return { ok: true, deviceModel: model, clearModel: false };
  }

  return { ok: true, deviceModel: undefined, clearModel: true };
}

/**
 * Validate displayName (generic friendly name).
 * Required for Fleet Tracker; optional for other types (preserved if provided).
 */
function validateDisplayNameForType(deviceType, displayNameRaw, { requiredForFleet = true } = {}) {
  const name = displayNameRaw == null ? '' : String(displayNameRaw).trim();

  if (isGpsTrackerType(deviceType) && requiredForFleet) {
    if (!name) {
      return { ok: false, message: 'Vehicle Name is required for Fleet Tracker devices' };
    }
  }

  if (!name) {
    return { ok: true, displayName: undefined };
  }

  if (name.length < 2 || name.length > 80) {
    return { ok: false, message: 'Display name must be between 2 and 80 characters' };
  }

  return { ok: true, displayName: name };
}

module.exports = {
  DEVICE_TYPE_OPTIONS,
  MODELS_BY_CATEGORY,
  getModelsForCategory,
  isModelAllowed,
  validateDeviceModelForType,
  validateDisplayNameForType,
};
