const { validationError, rangeTooLarge } = require('./apiResponse');

/** Max history window per request (ms) — 7 days */
const MAX_HISTORY_MS = 7 * 24 * 60 * 60 * 1000;

const ALLOWED_INTERVALS = new Set(['5m', '1h', '1d']);

const INTERVAL_MS = {
  '5m': 5 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
};

/**
 * @param {string} fromStr
 * @param {string} toStr
 * @returns {{ from: Date, to: Date }}
 */
function parseRequiredRange(fromStr, toStr) {
  if (!fromStr || !toStr) {
    throw validationError('from and to are required ISO date strings', {
      fields: ['from', 'to'],
    });
  }

  const from = new Date(fromStr);
  const to = new Date(toStr);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw validationError('from and to must be valid ISO dates', {
      fields: ['from', 'to'],
    });
  }

  if (from.getTime() > to.getTime()) {
    throw validationError('from must be before to', { fields: ['from', 'to'] });
  }

  if (to.getTime() - from.getTime() > MAX_HISTORY_MS) {
    throw rangeTooLarge('History window cannot exceed 7 days', {
      maxDays: 7,
    });
  }

  return { from, to };
}

/**
 * @param {string} [interval]
 */
function parseInterval(interval = '5m') {
  if (!ALLOWED_INTERVALS.has(interval)) {
    throw validationError('interval must be one of 5m, 1h, 1d', {
      field: 'interval',
    });
  }
  return { interval, intervalMs: INTERVAL_MS[interval] };
}

/**
 * @param {string|number|undefined} value
 * @param {number} fallback
 * @param {number} max
 */
function parseLimit(value, fallback = 500, max = 5000) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), max);
}

/**
 * @param {string|number|undefined} value
 * @param {number} fallback
 */
function parsePage(value, fallback = 1) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

module.exports = {
  MAX_HISTORY_MS,
  ALLOWED_INTERVALS,
  INTERVAL_MS,
  parseRequiredRange,
  parseInterval,
  parseLimit,
  parsePage,
};
