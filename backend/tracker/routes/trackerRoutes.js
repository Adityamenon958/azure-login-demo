const express = require('express');
const controller = require('../controllers/trackerController');
const { trackerErrorHandler } = require('../middleware/trackerErrorHandler');

const router = express.Router();

// ✅ Auth is applied when mounting in server.js: app.use('/api/tracker', authenticateToken, trackerRoutes)

router.get('/overview', controller.getOverview);
router.get('/live-locations', controller.getLiveLocations);
router.get('/map/bounds', controller.getMapBounds);
router.get('/devices', controller.listDevices);
router.get('/devices/:id', controller.getDevice);
router.get('/devices/:id/history', controller.getHistory);
router.get('/devices/:id/statistics', controller.getStatistics);
router.get('/devices/:id/journey', controller.getJourney);
router.get('/activity', controller.getActivity);

router.use(trackerErrorHandler);

module.exports = router;
