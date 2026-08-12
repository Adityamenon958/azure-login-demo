/**
 * Superadmin-only filter: real hardware vs fleet simulator devices.
 * Real devices omit dataOrigin; simulators set dataOrigin = 'simulator'.
 */

function parseIncludeFlag(value, defaultValue = true) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return defaultValue;
}

function parseDataSourceFromQuery(query = {}, role) {
  if (role !== 'superadmin') {
    return { includeReal: true, includeDemo: true, active: false };
  }

  const includeReal = parseIncludeFlag(query.includeReal, true);
  const includeDemo = parseIncludeFlag(query.includeDemo, true);

  return {
    includeReal,
    includeDemo,
    active: !includeReal || !includeDemo,
  };
}

function buildDeviceDataOriginFilter({ includeReal = true, includeDemo = true } = {}) {
  if (includeReal && includeDemo) return null;

  if (!includeReal && !includeDemo) {
    return { _id: { $exists: false } };
  }

  if (includeReal && !includeDemo) {
    return { dataOrigin: { $ne: 'simulator' } };
  }

  return { dataOrigin: 'simulator' };
}

module.exports = {
  parseDataSourceFromQuery,
  buildDeviceDataOriginFilter,
};
