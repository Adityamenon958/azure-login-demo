const { ok } = require('../utils/apiResponse');
const { asyncHandler } = require('../middleware/trackerErrorHandler');
const { parseDataSourceFromQuery } = require('../utils/dataSourceFilter');
const overviewService = require('../services/trackerOverviewService');
const liveService = require('../services/trackerLiveService');
const deviceService = require('../services/trackerDeviceService');
const historyService = require('../services/trackerHistoryService');
const statsService = require('../services/trackerStatsService');
const journeyService = require('../services/trackerJourneyService');

function scopeFromReq(req) {
  const { role, companyName } = req.user || {};
  const companyNameFilter =
    role === 'superadmin' && req.query.companyName
      ? String(req.query.companyName).trim()
      : undefined;
  const dataSource = parseDataSourceFromQuery(req.query, role);
  return {
    role,
    companyName,
    companyNameFilter,
    includeReal: dataSource.includeReal,
    includeDemo: dataSource.includeDemo,
  };
}

const getOverview = asyncHandler(async (req, res) => {
  const data = await overviewService.getOverview(scopeFromReq(req));
  return ok(res, data);
});

const getLiveLocations = asyncHandler(async (req, res) => {
  const data = await liveService.getLiveLocations(scopeFromReq(req));
  return ok(res, data);
});

const getMapBounds = asyncHandler(async (req, res) => {
  const { north, south, east, west } = req.query;
  const data = await liveService.getLocationsInBounds({
    ...scopeFromReq(req),
    north,
    south,
    east,
    west,
  });
  return ok(res, data);
});

const listDevices = asyncHandler(async (req, res) => {
  const data = await deviceService.listDevices({
    ...scopeFromReq(req),
    page: req.query.page,
    limit: req.query.limit,
    search: req.query.search,
    status: req.query.status,
  });
  return ok(res, data);
});

const getDevice = asyncHandler(async (req, res) => {
  const data = await deviceService.getDeviceById({
    ...scopeFromReq(req),
    deviceId: req.params.id,
  });
  return ok(res, data);
});

const getHistory = asyncHandler(async (req, res) => {
  const data = await historyService.getHistory({
    ...scopeFromReq(req),
    deviceId: req.params.id,
    from: req.query.from,
    to: req.query.to,
    limit: req.query.limit,
    cursor: req.query.cursor,
  });
  return ok(res, data);
});

const getStatistics = asyncHandler(async (req, res) => {
  const data = await historyService.getStatistics({
    ...scopeFromReq(req),
    deviceId: req.params.id,
    from: req.query.from,
    to: req.query.to,
    interval: req.query.interval,
  });
  return ok(res, data);
});

const getActivity = asyncHandler(async (req, res) => {
  const data = await statsService.getActivity({
    ...scopeFromReq(req),
    deviceId: req.query.deviceId,
    limit: req.query.limit,
  });
  return ok(res, data);
});

const getJourney = asyncHandler(async (req, res) => {
  const data = await journeyService.getJourney({
    ...scopeFromReq(req),
    deviceId: req.params.id,
    from: req.query.from,
    to: req.query.to,
  });
  return ok(res, data);
});

module.exports = {
  getOverview,
  getLiveLocations,
  getMapBounds,
  listDevices,
  getDevice,
  getHistory,
  getStatistics,
  getActivity,
  getJourney,
};
