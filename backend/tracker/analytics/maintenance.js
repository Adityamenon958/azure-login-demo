/**
 * Maintenance due-items helper (Phase 3).
 * Pure functions — uses Device.totalEngineMs / odometer / calendar schedules.
 */

const MS_PER_HOUR = 3600000;
const DUE_SOON_RATIO = 0.1;

/**
 * @param {object} device lean Device
 * @param {{ odometerEndKm?: number|null, now?: Date }} opts
 * @returns {Array<{ label, strategy, remaining, unit, severity, dueIn }>}
 */
function computeDueItems(device, opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const odometerKm = opts.odometerEndKm != null ? Number(opts.odometerEndKm) : null;
  const totalEngineMs = Number(device?.totalEngineMs) || 0;
  const schedules = Array.isArray(device?.maintenanceSchedules)
    ? device.maintenanceSchedules.filter((s) => s && s.active !== false)
    : [];

  const items = [];
  for (const s of schedules) {
    const label = s.label || 'Service';
    const interval = Number(s.intervalValue) || 0;
    if (interval <= 0) continue;

    let remaining = null;
    let unit = '';
    let dueIn = '';

    if (s.strategy === 'engineHours') {
      const usedSince =
        (totalEngineMs - (Number(s.lastDoneEngineMs) || 0)) / MS_PER_HOUR;
      remaining = interval - usedSince;
      unit = 'engine hours';
      dueIn =
        remaining <= 0
          ? 'Overdue'
          : `${Math.round(remaining * 10) / 10} engine hours`;
    } else if (s.strategy === 'distanceKm') {
      if (odometerKm == null) continue;
      const usedSince = odometerKm - (Number(s.lastDoneOdometerKm) || 0);
      remaining = interval - usedSince;
      unit = 'km';
      dueIn = remaining <= 0 ? 'Overdue' : `${Math.round(remaining)} km`;
    } else if (s.strategy === 'calendar') {
      const last = s.lastDoneAt ? new Date(s.lastDoneAt) : null;
      if (!last || Number.isNaN(last.getTime())) continue;
      const dueAt = new Date(last);
      dueAt.setMonth(dueAt.getMonth() + interval);
      remaining = (dueAt.getTime() - now.getTime()) / 86400000;
      unit = 'days';
      dueIn =
        remaining <= 0 ? 'Overdue' : `${Math.ceil(remaining)} days`;
    } else {
      continue;
    }

    let severity = 'ok';
    if (remaining <= 0) severity = 'due';
    else if (remaining <= interval * DUE_SOON_RATIO) severity = 'soon';

    items.push({
      label,
      strategy: s.strategy,
      remaining: Math.round(remaining * 100) / 100,
      unit,
      severity,
      dueIn,
    });
  }

  return items;
}

function hasMaintenanceDue(device, opts = {}) {
  return computeDueItems(device, opts).some((i) => i.severity === 'due');
}

function hasMaintenanceSoonOrDue(device, opts = {}) {
  return computeDueItems(device, opts).some(
    (i) => i.severity === 'due' || i.severity === 'soon'
  );
}

module.exports = {
  computeDueItems,
  hasMaintenanceDue,
  hasMaintenanceSoonOrDue,
  DUE_SOON_RATIO,
};
