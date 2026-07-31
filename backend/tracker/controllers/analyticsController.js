const { ok } = require('../utils/apiResponse');
const { asyncHandler } = require('../middleware/trackerErrorHandler');
const analyticsService = require('../analytics/analyticsService');

function scopeFromReq(req) {
  const { role, companyName } = req.user || {};
  const companyNameFilter =
    role === 'superadmin' && req.query.companyName
      ? String(req.query.companyName).trim()
      : undefined;
  return { role, companyName, companyNameFilter };
}

const getSummary = asyncHandler(async (req, res) => {
  const data = await analyticsService.getSummary(scopeFromReq(req), {
    from: req.query.from,
    to: req.query.to,
  });
  return ok(res, data);
});

const getVehicles = asyncHandler(async (req, res) => {
  const data = await analyticsService.getVehicles(scopeFromReq(req), req.query);
  return ok(res, data);
});

const getRankings = asyncHandler(async (req, res) => {
  const data = await analyticsService.getRankings(scopeFromReq(req), req.query);
  return ok(res, data);
});

const getVehicleDetail = asyncHandler(async (req, res) => {
  const data = await analyticsService.getVehicleDetail(
    scopeFromReq(req),
    req.params.id,
    { from: req.query.from, to: req.query.to }
  );
  return ok(res, data);
});

const getExport = asyncHandler(async (req, res) => {
  const file = await analyticsService.getExport(scopeFromReq(req), req.query);
  res.setHeader('Content-Type', file.contentType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${file.filename}"`
  );
  if (file.isBuffer) {
    return res.send(file.body);
  }
  return res.send(file.body);
});

module.exports = {
  getSummary,
  getVehicles,
  getRankings,
  getVehicleDetail,
  getExport,
};
