const { TrackerError, fail, ERROR_CODES } = require('../utils/apiResponse');

/**
 * Wrap async route handlers so rejected promises hit the error middleware.
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Tracker module error normalizer — attach after tracker routes.
 */
function trackerErrorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof TrackerError) {
    console.warn('[tracker]', err.code, err.message, {
      path: req.path,
      companyName: req.user?.companyName,
      details: err.details,
    });
    return fail(res, err.status, err.code, err.message, err.details);
  }

  console.error('[tracker] unexpected error', {
    path: req.path,
    companyName: req.user?.companyName,
    message: err.message,
    stack: err.stack,
  });

  return fail(
    res,
    500,
    ERROR_CODES.TRACKER_INTERNAL_ERROR,
    'An unexpected error occurred'
  );
}

module.exports = {
  asyncHandler,
  trackerErrorHandler,
};
