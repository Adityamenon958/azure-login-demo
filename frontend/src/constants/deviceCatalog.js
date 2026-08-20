/**
 * ✅ Keep in sync with backend/utils/deviceCatalog.js
 */

export const DEVICE_TYPE_OPTIONS = [
  { value: 'crane', label: 'Crane' },
  { value: 'elevator', label: 'Elevator' },
  { value: 'energyMeter', label: 'Energy Meter' },
  { value: 'gpsTracker', label: 'Fleet Tracker' },
];

export const MODELS_BY_CATEGORY = {
  gpsTracker: ['FMB920', 'FMB125'],
  energyMeter: [],
  crane: [],
  elevator: [],
};

export function getModelsForCategory(deviceType) {
  const list = MODELS_BY_CATEGORY[deviceType];
  return Array.isArray(list) ? [...list] : [];
}

export function isGpsTrackerType(type) {
  return String(type || '').toLowerCase() === 'gpstracker';
}

export function categoryLabel(deviceType) {
  const found = DEVICE_TYPE_OPTIONS.find((t) => t.value === deviceType);
  return found ? found.label : deviceType || '—';
}
