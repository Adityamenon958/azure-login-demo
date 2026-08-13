/**
 * IST (Asia/Kolkata, UTC+5:30) date helpers for analytics rollups.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function toIstParts(date) {
  const d = new Date(date);
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return {
    y: ist.getUTCFullYear(),
    m: ist.getUTCMonth() + 1,
    day: ist.getUTCDate(),
    hour: ist.getUTCHours(),
    minute: ist.getUTCMinutes(),
    second: ist.getUTCSeconds(),
  };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** "YYYY-MM-DD" in IST */
function istDayKey(date) {
  const p = toIstParts(date);
  return `${p.y}-${pad2(p.m)}-${pad2(p.day)}`;
}

/** "YYYY-MM" in IST */
function istMonthKey(date) {
  const p = toIstParts(date);
  return `${p.y}-${pad2(p.m)}`;
}

/** "YYYY" in IST */
function istYearKey(date) {
  return String(toIstParts(date).y);
}

/** Start of IST calendar day as UTC Date */
function istDayStart(dateOrKey) {
  let y;
  let m;
  let day;
  if (typeof dateOrKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateOrKey)) {
    [y, m, day] = dateOrKey.split('-').map(Number);
  } else {
    const p = toIstParts(dateOrKey);
    y = p.y;
    m = p.m;
    day = p.day;
  }
  // IST midnight = UTC previous day 18:30
  return new Date(Date.UTC(y, m - 1, day, 0, 0, 0) - IST_OFFSET_MS);
}

/** Exclusive end of IST calendar day (= start of next day) */
function istDayEndExclusive(dateOrKey) {
  const start = istDayStart(dateOrKey);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

function istMonthStart(dateOrKey) {
  let y;
  let m;
  if (typeof dateOrKey === 'string' && /^\d{4}-\d{2}$/.test(dateOrKey)) {
    [y, m] = dateOrKey.split('-').map(Number);
  } else {
    const p = toIstParts(dateOrKey);
    y = p.y;
    m = p.m;
  }
  return istDayStart(`${y}-${pad2(m)}-01`);
}

function istYearStart(yearOrDate) {
  let y;
  if (typeof yearOrDate === 'number') y = yearOrDate;
  else if (typeof yearOrDate === 'string' && /^\d{4}$/.test(yearOrDate)) y = Number(yearOrDate);
  else y = toIstParts(yearOrDate).y;
  return istDayStart(`${y}-01-01`);
}

/** Yesterday's IST day key relative to "now" */
function previousIstDayKey(now = new Date()) {
  const startToday = istDayStart(now);
  return istDayKey(new Date(startToday.getTime() - 1));
}

/** Start of the IST clock hour containing `date` */
function istHourStart(date) {
  const p = toIstParts(date);
  return new Date(Date.UTC(p.y, p.m - 1, p.day, p.hour, 0, 0) - IST_OFFSET_MS);
}

/** "YYYY-MM-DDTHH" in IST */
function istHourKey(date) {
  const p = toIstParts(date);
  return `${p.y}-${pad2(p.m)}-${pad2(p.day)}T${pad2(p.hour)}`;
}

/**
 * Pick rollup granularity for a query range.
 * ≤31 days → day; ≤24 months → month; else → year
 */
function resolveGranularity(from, to) {
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  const days = Math.max(1, Math.ceil((toMs - fromMs) / 86400000));
  if (days <= 31) return 'day';
  if (days <= 31 * 24) return 'month';
  return 'year';
}

function isSameIstDay(a, b) {
  return istDayKey(a) === istDayKey(b);
}

module.exports = {
  IST_OFFSET_MS,
  toIstParts,
  istDayKey,
  istMonthKey,
  istYearKey,
  istDayStart,
  istDayEndExclusive,
  istMonthStart,
  istYearStart,
  previousIstDayKey,
  istHourStart,
  istHourKey,
  resolveGranularity,
  isSameIstDay,
  pad2,
};
