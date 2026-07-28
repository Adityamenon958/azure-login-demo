const ERROR_CODES = require('../constants/errorCodes');

class TrackerError extends Error {
  /**
   * @param {number} status
   * @param {string} code
   * @param {string} message
   * @param {object} [details]
   */
  constructor(status, code, message, details = {}) {
    super(message);
    this.name = 'TrackerError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function validationError(message, details = {}) {
  return new TrackerError(400, ERROR_CODES.TRACKER_VALIDATION_ERROR, message, details);
}

function rangeTooLarge(message, details = {}) {
  return new TrackerError(400, ERROR_CODES.TRACKER_RANGE_TOO_LARGE, message, details);
}

function notFound(message = 'Device not found') {
  return new TrackerError(404, ERROR_CODES.TRACKER_DEVICE_NOT_FOUND, message);
}

function forbidden(message = 'Access denied') {
  return new TrackerError(403, ERROR_CODES.TRACKER_FORBIDDEN, message);
}

function ok(res, data, status = 200) {
  return res.status(status).json({
    success: true,
    generatedAt: new Date().toISOString(),
    data,
  });
}

function fail(res, status, code, message, details = {}) {
  return res.status(status).json({
    success: false,
    generatedAt: new Date().toISOString(),
    error: { code, message, details },
  });
}

module.exports = {
  TrackerError,
  validationError,
  rangeTooLarge,
  notFound,
  forbidden,
  ERROR_CODES,
  ok,
  fail,
};
