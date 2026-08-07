const { getProfile, listProfiles } = require('./profiles');
const { listDemoPlaces, resolvePlace } = require('./geocode');
const { buildWaypoints } = require('./routes');
const { advanceTick, buildAvlFromTick, ensureWaypoints } = require('./tick');
const { seedHistory } = require('./seedHistory');
const { buildAvlRecordDoc } = require('./avlBuilder');
const routeLibrary = require('./routeLibrary');

function generateSimImei() {
  // 15-digit unique-ish IMEI for demos
  const base = Date.now().toString().slice(-12);
  const rnd = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `${base}${rnd}`.slice(0, 15);
}

function applyProfileDefaults(body) {
  const profile = getProfile(body.behaviourProfile || 'delivery');
  return {
    behaviourProfile: body.behaviourProfile || 'delivery',
    routeType: body.routeType || profile.routeType,
    speedProfile: body.speedProfile || profile.speedProfile,
    workStart: body.workStart || profile.workStart,
    workEnd: body.workEnd || profile.workEnd,
    lunchStart: body.lunchStart || profile.lunchStart,
    lunchMinutes: body.lunchMinutes != null ? Number(body.lunchMinutes) : profile.lunchMinutes,
    defaultStopMinutes:
      body.defaultStopMinutes != null ? Number(body.defaultStopMinutes) : profile.defaultStopMinutes,
  };
}

module.exports = {
  getProfile,
  listProfiles,
  listDemoPlaces,
  resolvePlace,
  buildWaypoints,
  advanceTick,
  buildAvlFromTick,
  ensureWaypoints,
  seedHistory,
  buildAvlRecordDoc,
  generateSimImei,
  applyProfileDefaults,
  routeLibrary,
};
