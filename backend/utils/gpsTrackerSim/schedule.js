/**
 * IST workday schedule helpers.
 */

function parseHm(hm) {
  const [h, m] = String(hm || '00:00').split(':').map((n) => parseInt(n, 10) || 0);
  return h * 60 + m;
}

/** Minutes since midnight in Asia/Kolkata */
function istMinutesNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
  return hour * 60 + minute;
}

function istDayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * @returns {'beforeWork'|'working'|'lunch'|'afterWork'}
 */
function getDayPhase(sim, date = new Date()) {
  const nowM = istMinutesNow(date);
  const start = parseHm(sim.workStart || '08:30');
  const end = parseHm(sim.workEnd || '17:30');
  const lunchStart = parseHm(sim.lunchStart || '13:00');
  const lunchEnd = lunchStart + (Number(sim.lunchMinutes) || 45);

  if (nowM < start || nowM >= end) return nowM < start ? 'beforeWork' : 'afterWork';
  if (nowM >= lunchStart && nowM < lunchEnd) return 'lunch';
  return 'working';
}

function isWorkingPhase(phase) {
  return phase === 'working';
}

module.exports = {
  parseHm,
  istMinutesNow,
  istDayKey,
  getDayPhase,
  isWorkingPhase,
};
